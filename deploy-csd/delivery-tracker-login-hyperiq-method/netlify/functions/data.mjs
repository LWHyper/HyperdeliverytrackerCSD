// Built-in order books, served only to signed in users.
// GET /.netlify/functions/data -> { ORDERS:[...], DOWD:[...] }
// data/data.js is bundled in at deploy time and blocked from direct download
// in netlify.toml, so this is the only way to read it.
import { ORDERS, DOWD } from '../../data/data.js';
import { requireUser, json } from '../lib/auth.mjs';

export const handler = async (event, context) => {
  const auth = requireUser(event, context);
  if (auth.response) return auth.response;
  return json(200, { ORDERS, DOWD });
};
