/* CSD Delivery Tracker auth gate (Netlify Identity). Same design as HyperIQ's
 * src/auth.standalone.js.
 *
 * Two jobs:
 * 1. Don't show the dashboard to someone who isn't signed in.
 * 2. Attach the Identity token to EVERY request to our own functions.
 *
 * (2) is the one that matters. The functions reject unauthenticated requests
 * on their own (netlify/lib/auth.mjs), which is what actually protects the data.
 *
 * AUTH_DISABLED (Netlify env var) is the rollout switch: while it is true the
 * server gate is bypassed and this screen stands down, so nobody is locked out.
 * The page learns its state from /.netlify/functions/auth-config.
 */
(function () {
  var EDIT_ROLES = ['admin', 'connectivity'];
  var nativeFetch = window.fetch.bind(window);
  var resolveUser;
  var userReady = new Promise(function (r) { resolveUser = r; });
  var gate;

  // Keep the widget's own forms (sign in, sign up, set password) above the gate.
  var css = document.createElement('style');
  css.textContent = '#netlify-identity-widget{z-index:9500 !important;}';
  document.head.appendChild(css);

  function isOurs(input) {
    try {
      var u = new URL(typeof input === 'string' ? input : input.url, location.href);
      return u.origin === location.origin &&
        (u.pathname.indexOf('/.netlify/functions/') === 0 || u.pathname.indexOf('/api/') === 0) &&
        u.pathname.indexOf('/auth-config') === -1;
    } catch (e) { return false; }
  }

  /* ---- Token on every request -------------------------------------------
   * fetch is wrapped rather than each call site being edited, so a new
   * endpoint added later is authenticated by default. Calls wait for a login,
   * so no data loads behind the sign in screen. user.jwt() refreshes the
   * token when it is close to expiry. */
  window.fetch = function (input, opts) {
    if (!isOurs(input)) return nativeFetch(input, opts);
    return userReady.then(function (user) {
      if (!user) return nativeFetch(input, opts); // AUTH_DISABLED
      return user.jwt().catch(function () {
        return user.token && user.token.access_token;
      }).then(function (token) {
        var o = Object.assign({}, opts || {});
        var h = new Headers(o.headers || (input instanceof Request ? input.headers : undefined));
        if (token) h.set('Authorization', 'Bearer ' + token);
        o.headers = h;
        return nativeFetch(input, o).then(function (res) {
          if (res.status === 401) showGate('Your session expired. Please sign in again.');
          return res;
        });
      });
    });
  };

  function describe(user) {
    var roles = ((user.app_metadata && user.app_metadata.roles) || []).map(function (r) { return String(r).toLowerCase(); });
    var meta = user.user_metadata || {};
    var canEdit = roles.some(function (r) { return EDIT_ROLES.indexOf(r) !== -1; });
    var role = roles.indexOf('admin') !== -1 ? 'Admin'
      : roles.indexOf('connectivity') !== -1 ? 'Connectivity Specialist' : 'View only';
    return {
      email: user.email || '',
      name: meta.full_name || meta.name || user.email || '',
      roles: roles, canEdit: canEdit, roleLabel: role,
      signOut: function () { window.netlifyIdentity.logout(); }
    };
  }

  function announce(info) {
    window.hnAuth = info;
    window.dispatchEvent(new Event('hn-auth'));
  }

  function buildGate() {
    gate = document.createElement('div');
    gate.id = 'hn-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-label', 'Sign in');
    gate.style.cssText = 'position:fixed;inset:0;z-index:9000;background:#15171C;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;padding:16px;';
    gate.innerHTML =
      '<div style="background:#fff;border-radius:12px;max-width:380px;width:100%;padding:32px 28px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.35);">' +
        '<div style="width:46px;height:46px;margin:0 auto 14px;background:#8DC63F;border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;color:#15171C;">HN</div>' +
        '<div style="font-weight:800;font-size:12px;letter-spacing:2px;color:#5B8C1F;">CDS · HYPER VIEW</div>' +
        '<div style="font-weight:800;font-size:20px;color:#1A1D23;margin-top:6px;">Delivery Tracker Dashboard</div>' +
        '<div id="hn-gate-msg" style="font-size:13px;color:#5A6472;margin-top:10px;line-height:1.5;">Staff sign in. Use your Hyper Networks email.</div>' +
        '<button id="hn-gate-btn" type="button" style="margin-top:20px;width:100%;min-height:44px;background:#15171C;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;">Sign in</button>' +
        '<div style="font-size:11.5px;color:#8A93A0;margin-top:14px;">Need access? Ask Lauren Walker.</div>' +
      '</div>';
    document.body.appendChild(gate);
    gate.querySelector('#hn-gate-btn').addEventListener('click', function () {
      if (window.netlifyIdentity) window.netlifyIdentity.open('login');
    });
  }

  function showGate(msg) {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', function () { showGate(msg); });
      return;
    }
    if (!gate) buildGate();
    if (msg) gate.querySelector('#hn-gate-msg').textContent = msg;
    gate.style.display = 'flex';
  }
  function hideGate() { if (gate) gate.style.display = 'none'; }

  function pendingTokenFlow() {
    return /(invite|recovery|confirmation|email_change)_token=/.test(location.hash || '');
  }

  // Cover the page from the first paint; it lifts once a login is confirmed.
  showGate(null);

  // Rollout switch first: with AUTH_DISABLED on, stand the gate down.
  nativeFetch('/.netlify/functions/auth-config', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .catch(function () { return {}; })
    .then(function (cfg) {
      if (cfg && cfg.authDisabled) {
        hideGate();
        announce({ email: '', name: '', roles: [], canEdit: true, roleLabel: 'Sign in not required yet', signOut: function () {} });
        resolveUser(null);
        return;
      }
      startIdentity();
    });

  function startIdentity() {
    var ni = window.netlifyIdentity;
    if (!ni) {
      showGate('The sign in service did not load. Let Lauren know so she can fix it.');
      return;
    }
    ni.on('init', function (user) {
      if (user) { hideGate(); announce(describe(user)); resolveUser(user); }
      else if (pendingTokenFlow()) {
        hideGate(); // the widget's own set a password form owns the screen
      } else {
        showGate(null); announce(null);
      }
    });
    ni.on('login', function (user) {
      ni.close();
      // Clear any invite/recovery token so a refresh doesn't replay it.
      if (pendingTokenFlow()) history.replaceState(null, '', location.pathname + location.search);
      hideGate();
      announce(describe(user));
      resolveUser(user);
    });
    // Full reload on sign out so nothing stays on screen or in memory.
    ni.on('logout', function () { location.reload(); });
    ni.init({ locale: 'en' });
    // The widget may already have initialised before this ran (the config
    // check above is async), in which case "init" won't fire again for us.
    var existing = ni.currentUser && ni.currentUser();
    if (existing) { hideGate(); announce(describe(existing)); resolveUser(existing); }
  }
})();
