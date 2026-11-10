/**
 * Hyper CDS: push a dashboard note into the HubSpot deal timeline.
 * POST /.netlify/functions/hubspot-note   { dealId, body, projectName }
 *   -> { ok:true, noteId, url }
 * Admin / connectivity only. Every note is stamped with the signed in user.
 * Requires the service key to have: crm.objects.notes.write
 */
import { requireUser, json } from '../lib/auth.mjs';

const TOKEN = process.env.HUBSPOT_TOKEN;
const PORTAL = process.env.HS_PORTAL_ID || '47345387';
const NOTE_TO_DEAL = 214; // HubSpot-defined association: note -> deal

export const handler = async (event, context) => {
  const auth = requireUser(event, context, { edit: true });
  if (auth.response) return auth.response;
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  if (!TOKEN) return json(500, { error: 'HUBSPOT_TOKEN not set on this Netlify project' });

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (e) {}
  const dealId = String(payload.dealId || '').trim();
  const typed = String(payload.body || '').trim();
  if (!dealId) return json(400, { error: 'dealId required' });
  if (!typed) return json(400, { error: 'Nothing to push. The note is empty.' });

  const who = String(auth.user.name || auth.user.email || '').replace(/[<>&]/g, '');
  const body = who && !auth.bypassed
    ? typed + '<p style="color:#888">Pushed from the CDS Delivery Tracker by ' + who + '</p>'
    : typed;

  try {
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { hs_timestamp: new Date().toISOString(), hs_note_body: body },
        associations: [{
          to: { id: dealId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: NOTE_TO_DEAL }],
        }],
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      const scope = /scope|permission|403/i.test(text) || res.status === 403;
      return json(502, {
        error: scope
          ? 'HubSpot refused the write. Add the crm.objects.notes.write scope to the service key, then redeploy.'
          : `HubSpot ${res.status}: ${text.slice(0, 300)}`,
      });
    }
    const data = JSON.parse(text);
    return json(200, { ok: true, noteId: data.id, url: `https://app.hubspot.com/contacts/${PORTAL}/record/0-3/${dealId}/` });
  } catch (e) {
    return json(502, { error: String(e.message || e) });
  }
};
