// Netlify runs this automatically whenever someone signs up (the file name
// "identity-validate" is what wires it up). During the open sign up day it
// turns away any email that is not @hypernetworks.com.
// New accounts start view only; give admin / connectivity roles by hand.
const ALLOWED = (process.env.SIGNUP_DOMAIN || 'hypernetworks.com').toLowerCase();

export const handler = async (event) => {
  let email = '';
  try { email = String(JSON.parse(event.body || '{}').user.email || '').toLowerCase(); } catch (e) {}
  if (!email.endsWith('@' + ALLOWED)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Use your @' + ALLOWED + ' email to sign up.' }) };
  }
  return { statusCode: 200, body: JSON.stringify({}) };
};
