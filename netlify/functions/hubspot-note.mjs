/**
 * Hyper CSD — push a dashboard note back into the HubSpot deal timeline.
 * POST /api/hubspot-note   { dealId, body, projectName }
 *   → { ok:true, noteId, url }
 *
 * Creates a Note engagement associated with the deal, so it shows up under
 * the deal's Notes / Activity feed in HubSpot.
 *
 * Requires the service key to have: crm.objects.notes.write
 * (same HUBSPOT_TOKEN env var the read endpoint uses).
 */

const TOKEN = process.env.HUBSPOT_TOKEN;
const PORTAL = process.env.HS_PORTAL_ID || '47345387';
const NOTE_TO_DEAL = 214; // HubSpot-defined association: note → deal

export default async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });
  if (!TOKEN) return new Response(JSON.stringify({ error: 'HUBSPOT_TOKEN not set on this Netlify project' }), { status: 500, headers });

  let payload = {};
  try { payload = await req.json(); } catch (e) {}
  const dealId = String(payload.dealId || '').trim();
  const body = String(payload.body || '').trim();
  if (!dealId) return new Response(JSON.stringify({ error: 'dealId required' }), { status: 400, headers });
  if (!body) return new Response(JSON.stringify({ error: 'Nothing to push — the note is empty' }), { status: 400, headers });

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
      return new Response(JSON.stringify({
        error: scope
          ? 'HubSpot refused the write — add the crm.objects.notes.write scope to the service key, then redeploy.'
          : `HubSpot ${res.status}: ${text.slice(0, 300)}`,
      }), { status: 502, headers });
    }
    const data = JSON.parse(text);
    return new Response(JSON.stringify({
      ok: true,
      noteId: data.id,
      url: `https://app.hubspot.com/contacts/${PORTAL}/record/0-3/${dealId}/`,
    }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers });
  }
};

export const config = { path: '/api/hubspot-note' };
