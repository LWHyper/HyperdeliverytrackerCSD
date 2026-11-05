/*
 * CSD Delivery Tracker sign in gate (same pattern as HyperIQ).
 *
 * 1. Netlify Identity holds the accounts (invite only).
 * 2. Until someone signs in, a full screen gate covers the page and every
 *    /api call waits, so no data loads in the background.
 * 3. Every /api call carries the user's token. The functions check it and
 *    refuse anything without a valid login, or without an edit role for writes.
 * 4. window.hnAuth + the "hn-auth" event tell the dashboard who is signed in.
 */
(function () {
  var EDIT_ROLES = ['admin', 'connectivity'];
  var nativeFetch = window.fetch.bind(window);
  var resolveUser;
  var userReady = new Promise(function (r) { resolveUser = r; });
  var gate;

  function isApi(input) {
    try {
      var u = new URL(typeof input === 'string' ? input : input.url, location.href);
      return u.origin === location.origin && u.pathname.indexOf('/api/') === 0;
    } catch (e) { return false; }
  }

  // Every /api request waits for a login, then carries a fresh token.
  // user.jwt() refreshes the token when it is close to expiry.
  window.fetch = function (input, opts) {
    if (!isApi(input)) return nativeFetch(input, opts);
    return userReady.then(function (user) {
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

  function announce(user) {
    window.hnAuth = user ? describe(user) : null;
    window.dispatchEvent(new Event('hn-auth'));
  }

  function buildGate() {
    gate = document.createElement('div');
    gate.id = 'hn-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-label', 'Sign in');
    gate.style.cssText = 'position:fixed;inset:0;z-index:90;background:#15171C;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;padding:16px;';
    gate.innerHTML =
      '<div style="background:#fff;border-radius:12px;max-width:380px;width:100%;padding:32px 28px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.35);">' +
        '<div style="width:46px;height:46px;margin:0 auto 14px;background:#8DC63F;border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;color:#15171C;">HN</div>' +
        '<div style="font-weight:800;font-size:12px;letter-spacing:2px;color:#5B8C1F;">CSD · HYPER VIEW</div>' +
        '<div style="font-weight:800;font-size:20px;color:#1A1D23;margin-top:6px;">Delivery Tracker Dashboard</div>' +
        '<div id="hn-gate-msg" style="font-size:13px;color:#5A6472;margin-top:10px;line-height:1.5;">Sign in with your Hyper Networks account to continue.</div>' +
        '<button id="hn-gate-btn" type="button" style="margin-top:20px;width:100%;min-height:44px;background:#15171C;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;">Sign in</button>' +
        '<div style="font-size:11.5px;color:#8A93A0;margin-top:14px;">Access is by invitation. Contact an admin if you need an account.</div>' +
      '</div>';
    document.body.appendChild(gate);
    gate.querySelector('#hn-gate-btn').addEventListener('click', function () {
      window.netlifyIdentity.open('login');
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

  function start() {
    var ni = window.netlifyIdentity;
    if (!ni) {
      showGate('The sign in service did not load. Check your connection and refresh.');
      return;
    }
    // Invite and password reset links carry a token in the URL. Let the
    // widget show its own "set your password" form instead of the gate.
    var tokenFlow = /(invite|recovery|confirmation|email_change)_token=/.test(location.hash);
    // Cover the page from the first paint; it lifts once a login is confirmed.
    // The widget's own forms sit above the gate (z-index 99 vs 90).
    showGate(tokenFlow ? 'Finish setting up your account in the window above.' : null);

    ni.on('init', function (user) {
      if (user) { hideGate(); announce(user); resolveUser(user); }
      else announce(null);
    });
    ni.on('login', function (user) {
      ni.close();
      hideGate();
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      announce(user);
      resolveUser(user);
    });
    // Full reload on sign out so nothing stays on screen or in memory.
    ni.on('logout', function () { location.reload(); });
    ni.init();
  }

  // Listen right away: the widget can fire "init" as soon as the page loads,
  // and a listener added later would miss it and leave the gate up.
  start();
})();
