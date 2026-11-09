// Tells the page whether the AUTH_DISABLED rollout switch is on, so the
// sign in screen stands down while the server gate is bypassed.
// Returns no data, so it does not need a login.
import { authDisabled, json } from '../lib/auth.mjs';

export const handler = async () => json(200, { authDisabled: authDisabled() });
