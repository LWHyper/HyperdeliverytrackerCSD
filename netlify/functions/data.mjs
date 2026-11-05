/**
 * Built-in order books for the CSD Delivery Tracker, served only to signed-in users.
 * GET /api/data → { ORDERS:[…], DOWD:[…] }
 *
 * data/data.js is bundled into this function at deploy time and blocked
 * from direct download in netlify.toml, so the only way to read it is here.
 */
import { ORDERS, DOWD } from '../../data/data.js';
import { requireUser } from '../lib/auth.mjs';

export default async (req, context) => {
  const auth = await requireUser(req, context);
  if (auth.error) return auth.error;
  return new Response(JSON.stringify({ ORDERS, DOWD }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};

export const config = { path: '/api/data' };
