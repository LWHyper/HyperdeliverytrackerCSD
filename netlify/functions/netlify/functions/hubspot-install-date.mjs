/**
 * Hyper CSD — push the Carrier Installation Date from the dashboard into the HubSpot deal.
 * POST /api/hubspot-install-date   { dealId, date: "YYYY-MM-DD" }
 *   → { ok:true, property, url }
 *
 * The internal property name is resolved from the deal property schema by label
 * ("Carrier Installation Date" / "Carrier Install Date"), so it keeps working
 * even if the internal name differs. Override with HS_INSTALL_PROP if needed.
 *
 * Requires the service key to have: crm.objects.deals.write (+ crm.schemas.deals.read)
 */

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

export default async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });
  if (!TOKEN) return new Response(JSON.stringify({ error: 'HUBSPOT_TOKEN not set on this Netlify project' }), { status: 500, headers });

  let payload = {};
  try { payload = await req.json(); } catch (e) {}
  const dealId = String(payload.dealId || '').trim();
  const date = String(payload.date || '').trim();
  if (!dealId) return new Response(JSON.stringify({ error: 'dealId required' }), { status: 400, headers });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response(JSON.stringify({ error: 'Pick a date first (YYYY-MM-DD)' }), { status: 400, headers });

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
      return new Response(JSON.stringify({
        error: scope
          ? 'HubSpot refused the write — add crm.objects.deals.write to the service key, then redeploy.'
          : `HubSpot ${res.status}: ${text.slice(0, 300)}`,
      }), { status: 502, headers });
    }
    return new Response(JSON.stringify({
      ok: true,
      property,
      url: `https://app.hubspot.com/contacts/${PORTAL}/record/0-3/${dealId}/`,
    }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers });
  }
};

export const config = { path: '/api/hubspot-install-date' };
