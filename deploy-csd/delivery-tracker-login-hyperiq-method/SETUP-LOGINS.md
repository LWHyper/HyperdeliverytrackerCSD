# CSD Delivery Tracker: turning on individual logins

Same method as HyperIQ: Netlify Identity, a one day open sign up with no emails, then invite only. The site password stays on as an outer layer.

Roles (Netlify > Identity > click a user > Roles):

| Role | Can do |
| --- | --- |
| `admin` | View, upload sheets, push notes and install dates to HubSpot |
| `connectivity` | Same as admin |
| (blank) | View only |

Everyone who signs up starts view only. Add roles by hand.

## 1. Set the bypass switch FIRST

Netlify > Project configuration > Environment variables > add `AUTH_DISABLED` = `true`.

Do this before uploading. With it on, the server check is skipped and the sign in screen stands down, so nobody is locked out while Identity is set up.

## 2. Upload and deploy

Upload everything in this folder into the repo's `deploy-csd` folder (that is Netlify's base directory). Upload the contents, not the folder itself. Let Netlify deploy. Nothing changes for users yet.

## 3. Identity settings

Netlify > Identity:

1. Registration > Registration preferences > **Open** (for the sign up day only).
2. Emails > Confirmation template > turn **Autoconfirm on** (no confirmation email, so Checkpoint never sees a Netlify link).
3. External providers: leave all **off**.

Only @hypernetworks.com emails can sign up. `netlify/functions/identity-validate.mjs` rejects anything else, even while registration is open.

## 4. Remove the bypass and redeploy

Delete `AUTH_DISABLED`, then Deploys > Trigger deploy > **Clear cache and deploy site**. Functions only pick up env changes on deploy.

## 5. Sign yourself up and give yourself admin

Go to the site, enter the site password, Sign in > Sign up tab. Then Netlify > Identity > your user > Roles > `admin`. Sign out and back in so the role takes effect.

## 6. Send the team message

Everyone signs up the same way by end of day. Add `connectivity` to the specialists as they come in.

## 7. Close sign ups at end of day

Registration > **Invite only**. After this, add people by hand in Netlify > Identity.

## 8. Test signed out (the test that matters)

In a private window, after entering the site password but WITHOUT signing in, open:

- `/.netlify/functions/data`
- `/.netlify/functions/revenue`
- `/.netlify/functions/roster`
- `/data/data.js` (must be a 404)

Each function must return `Sign in required.` If you see order or revenue data, stop. That is the protection failing.

Then sign in with a view only account and confirm there are no upload or note buttons.

## 9. Keep the repo private

The repo holds the order data. GitHub > Settings > Danger Zone > Change visibility > Private.
