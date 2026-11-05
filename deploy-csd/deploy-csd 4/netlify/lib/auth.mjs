/**
 * Shared login check for every /api function on the CSD Delivery Tracker.
 *
 * The page sends the signed-in user's Netlify Identity token as
 *   Authorization: Bearer <token>
 * and this helper asks Netlify Identity who that token belongs to.
 * No token, or an expired one, gets a 401. A user without an edit role
 * gets a 403 on anything that changes data.
 *
 * Roles live on each user in Netlify > Identity > (user) > Roles.
 * EDIT_ROLES (env var, comma separated) overrides the default list.
 */

export const EDIT_ROLES = (process.env.EDIT_ROLES || 'admin,connectivity')
  .split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);

const cache = new Map(); // token -> { at, user }
const CACHE_MS = 60 * 1000;

const deny = (status, error) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function shape(user) {
  const roles = ((user.app_metadata && user.app_metadata.roles) || []).map((r) => String(r).toLowerCase());
  const meta = user.user_metadata || {};
  return {
    id: user.id || user.sub || '',
    email: user.email || '',
    name: meta.full_name || meta.name || user.email || '',
    roles,
    canEdit: roles.some((r) => EDIT_ROLES.includes(r)),
  };
}

async function lookup(req, token, context) {
  // Some Netlify runtimes attach the verified Identity user directly.
  const cc = context && context.clientContext && context.clientContext.user;
  if (cc) return shape(cc);

  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.user;

  const origin = new URL(req.url).origin;
  const res = await fetch(origin + '/.netlify/identity/user', {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!res.ok) return null;
  const user = shape(await res.json());
  cache.set(token, { at: Date.now(), user });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return user;
}

/**
 * const auth = await requireUser(req, context)               → any signed-in user
 * const auth = await requireUser(req, context, { edit:true }) → admin or connectivity only
 * if (auth.error) return auth.error;   otherwise auth.user = { email, name, roles, canEdit }
 */
export async function requireUser(req, context, opts = {}) {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: deny(401, 'Please sign in.') };
  let user = null;
  try { user = await lookup(req, m[1], context); } catch (e) { user = null; }
  if (!user) return { error: deny(401, 'Your session expired. Please sign in again.') };
  if (opts.edit && !user.canEdit) {
    return { error: deny(403, 'Your login is view only. Ask an admin for edit access.') };
  }
  return { user };
}
