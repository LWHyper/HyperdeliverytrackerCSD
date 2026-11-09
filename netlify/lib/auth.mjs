// Netlify Identity auth gate for the CSD Delivery Tracker functions.
// Same design as HyperIQ (Hyper-IQ-HGV/netlify/functions/lib/auth.js).
//
// THE POINT OF THIS FILE: the sign in screen in the browser is decoration.
// Without a server side check, anyone who knows the URL can call
// /.netlify/functions/revenue directly. Every data function must refuse an
// unauthenticated request, which is what requireUser() does.
//
// HOW IT WORKS: when a request carries `Authorization: Bearer <identity JWT>`,
// Netlify validates the token itself and exposes the decoded user on
// context.clientContext.user. We never verify a signature by hand.
// No user on the context means no valid token.
//
// ROLES: set per user in Netlify > Identity > (user) > Roles.
//   admin, connectivity  -> can upload sheets and push notes / install dates
//   (no role)            -> view only

export const EDIT_ROLES = ['admin', 'connectivity'];

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

export function authDisabled() {
  return String(process.env.AUTH_DISABLED || '').toLowerCase() === 'true';
}

export function getUser(context) {
  const user = context && context.clientContext && context.clientContext.user;
  if (!user) return null;
  const roles = ((user.app_metadata && user.app_metadata.roles) || []).map((r) => String(r).toLowerCase());
  return {
    id: user.sub || null,
    email: user.email || null,
    name: (user.user_metadata && user.user_metadata.full_name) || user.email || null,
    roles,
    canEdit: roles.some((r) => EDIT_ROLES.includes(r)),
  };
}

/**
 * Gate a function handler. Returns { user } on success, or { response } to
 * return immediately.
 *   requireUser(event, context)               any signed in user
 *   requireUser(event, context, {edit:true})  admin or connectivity only
 *
 * AUTH_DISABLED=true bypasses the gate during rollout. It is a hole in the
 * only real protection, so remove it once everyone has an account.
 */
export function requireUser(event, context, opts = {}) {
  if (authDisabled()) {
    return { user: { id: 'auth-disabled', email: '', name: 'Auth disabled', roles: [], canEdit: true }, bypassed: true };
  }
  const user = getUser(context);
  if (!user) {
    return {
      response: json(401, {
        error: 'Sign in required.',
        detail: 'This endpoint needs a Netlify Identity token. If you see this in the dashboard, your session expired. Reload and sign in again.',
      }),
    };
  }
  if (opts.edit && !user.canEdit) {
    return { response: json(403, { error: 'Your login is view only. Ask an admin for edit access.' }) };
  }
  return { user };
}

export { json };
