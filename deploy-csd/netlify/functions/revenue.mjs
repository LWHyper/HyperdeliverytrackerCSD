/**
 * Hyper CSD — LIVE deal revenue fetch (Netlify Function)
 * GET /api/revenue → { syncedAt, count, matchedOn, records:[…] }
 *
 * Pulls the money fields off every deal so the Delivery Tracker can show the
 * ACTUAL revenue to Hyper instead of a modelled commission %:
 *   Billed To = Customer        → master agent amount only
 *   Billed To = Hyper Networks  → MRR amount + master agent amount
 *
 * Property internal names differ per portal, so they're discovered from the
 * deal property list by label. Override any of them with env vars:
 *   HS_MRR_PROP        e.g. mrr_amount_cost_to_customer
 *   HS_MA_AMOUNT_PROP  e.g. master_agent_commission_amount
 *   HS_MA_PCT_PROP     e.g. master_agent_commission
 *   HS_BILLED_PROP     e.g. billed_to
 *   HS_DEALNUM_PROP    e.g. deal_number
 * Requires HUBSPOT_TOKEN (the pat-… service key).
 */

const TOKEN = process.env.HUBSPOT_TOKEN;
const API = 'https://api.hubapi.com';
const MAX_DEALS = 4000;

const hs = async (path, opts = {}) => {
  const res = await fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`HubSpot ${path} → ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
};

// Match a deal property by label first (labels are what Lauren sees), then name.
function findProp(all, tests) {
  for (const t of tests) {
    const hit = all.find(p => t.test(p.label || '')) || all.find(p => t.test(p.name || ''));
    if (hit) return hit.name;
  }
  return '';
}

async function resolveProps() {
  const all = (await hs('/crm/v3/properties/deals')).results || [];
  const p = {
    mrr: process.env.HS_MRR_PROP || findProp(all, [/^mrr amount \(cost to customer\)/i, /mrr amount.*customer/i, /^mrr amount$/i, /^mrr$/i]),
    maAmount: process.env.HS_MA_AMOUNT_PROP || findProp(all, [/^\$ master agent \(ma\) comm/i, /^\$ master agent/i, /master agent.*commission.*(amount|\$)/i]),
    maPct: process.env.HS_MA_PCT_PROP || findProp(all, [/^% master agent \(ma\) comm/i, /^% master agent/i, /master agent.*commission.*%/i]),
    billed: process.env.HS_BILLED_PROP || findProp(all, [/^billed to$/i, /^billed to/i, /^bill to/i]),
    dealNum: process.env.HS_DEALNUM_PROP || findProp(all, [/^deal number$/i, /^hyper deal ?#/i, /deal number/i]),
    master: findProp(all, [/^master agent$/i, /^master agent/i]),
    service: findProp(all, [/^service$/i, /^product/i]),
    nrrMa: findProp(all, [/^\$ nrr master agent/i]),
  };
  return p;
}

const num = v => {
  const s = String(v ?? '').replace(/[$,\s%]/g, '');
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
};

export default async () => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (!TOKEN) return new Response(JSON.stringify({ error: 'HUBSPOT_TOKEN not set on this Netlify project' }), { status: 500, headers });
  try {
    const P = await resolveProps();
    const wanted = ['dealname', 'dealstage', 'pipeline', 'closedate', 'amount',
      P.mrr, P.maAmount, P.maPct, P.billed, P.dealNum, P.master, P.service, P.nrrMa].filter(Boolean);

    const pipes = await hs('/crm/v3/pipelines/deals');
    const stageMap = {}, pipeMap = {};
    pipes.results.forEach(pl => { pipeMap[pl.id] = pl.label; pl.stages.forEach(st => { stageMap[st.id] = st.label; }); });

    const out = [];
    let after;
    do {
      const data = await hs('/crm/v3/objects/deals?limit=100&properties=' + wanted.join(',') + (after ? '&after=' + after : ''));
      (data.results || []).forEach(d => {
        const p = d.properties || {};
        const mrr = P.mrr ? num(p[P.mrr]) : null;
        const ma = P.maAmount ? num(p[P.maAmount]) : null;
        const billedRaw = P.billed ? String(p[P.billed] ?? '') : '';
        const hyper = /hyper/i.test(billedRaw);
        // Billed To Customer → commission only. Billed To Hyper → MRR + commission.
        const net = hyper ? (mrr || 0) + (ma || 0) : (ma != null ? ma : null);
        out.push({
          id: d.id,
          dealNumber: P.dealNum ? String(p[P.dealNum] ?? '').trim() : '',
          name: p.dealname || '',
          stage: stageMap[p.dealstage] || '',
          pipeline: pipeMap[p.pipeline] || '',
          billedTo: hyper ? 'Hyper Networks' : (billedRaw || ''),
          masterAgent: P.master ? String(p[P.master] ?? '') : '',
          service: P.service ? String(p[P.service] ?? '') : '',
          mrr, maAmount: ma, maPct: P.maPct ? num(p[P.maPct]) : null,
          net,
        });
      });
      after = data.paging?.next?.after;
    } while (after && out.length < MAX_DEALS);

    return new Response(JSON.stringify({
      syncedAt: new Date().toISOString(), live: true, count: out.length,
      properties: P, records: out,
    }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers });
  }
};

export const config = { path: '/api/revenue' };
