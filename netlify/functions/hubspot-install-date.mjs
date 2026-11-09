/**
 * Hyper CSD: push the Carrier Installation Date from the dashboard into the HubSpot deal.
 * POST /.netlify/functions/hubspot-install-date   { dealId, date: "YYYY-MM-DD" }
 *   -> { ok:true, property, url }
 * Admin / connectivity only.
 *
 * The internal property name is resolved from the deal property schema by label
 * ("Carrier Installation Date" / "Carrier Install Date"). Override with HS_INSTALL_PROP.
 * Requires the service key to have: crm.objects.deals.write (+ crm.schemas.deals.read)
 */
import { requireUser, json } from '../lib/auth.mjs';

const TOKEN = process.env.HUBSPOT_TOKEN;
const PORTAL = process.env.HS_PORTAL_ID || '47345387';
const OVERRIDE = process.env.HS_INSTALL_PROP || '';

let cachedProp = null;

async function resolveProp() {
  if (OVERRIDE) return OVERRIDE;
  if (cachedProp) return cachedProp;
  const res = await fetch('https://api.hubapi.com/crm/v3/properties/deals', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`Could not read deal properties (HubSpot ${res.status})`);
  const data = await res.json();
  const list = data.results || [];
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const wanted = ['carrierinstallationdate', 'carrierinstalldate'];
  let hit = list.find((p) => wanted.includes(norm(p.label)));
  if (!hit) hit = list.find((p) => wanted.includes(norm(p.name)));
  if (!hit) hit = list.find((p) => /carrier/.test(norm(p.label)) && /install/.test(norm(p.label)));
  if (!hit) throw new Error('No "Carrier Installation Date" property found on deals in this portal');
  cachedProp = hit.name;
  return cachedProp;
}

export const handler = async (event, context) => {
  const auth = requireUser(event, context, { edit: true });
  if (auth.response) return auth.response;
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  if (!TOKEN) return json(500, { error: 'HUBSPOT_TOKEN not set on this Netlify project' });

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (e) {}
  const dealId = String(payload.dealId || '').trim();
  const date = String(payload.date || '').trim();
  if (!dealId) return json(400, { error: 'dealId required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { error: 'Pick a date first (YYYY-MM-DD)' });

  try {
    const property = await resolveProp();
    const res = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { [property]: date } }),
    });
    const text = await res.text();
    if (!res.ok) {
      const scope = res.status === 403 || /scope|permission/i.test(text);
      return json(502, {
        error: scope
          ? 'HubSpot refused the write. Add crm.objects.deals.write to the service key, then redeploy.'
          : `HubSpot ${res.status}: ${text.slice(0, 300)}`,
      });
    }
    return json(200, { ok: true, property, url: `https://app.hubspot.com/contacts/${PORTAL}/record/0-3/${dealId}/` });
  } catch (e) {
    return json(502, { error: String(e.message || e) });
  }
};
