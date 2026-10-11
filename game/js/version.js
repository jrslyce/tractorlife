// game/js/version.js — the game's version number, shown on the login screen
// and as a small badge in-game. Bump GAME_VERSION with each release
// (1.0 -> 1.1 for new features, 1.0.1 for fixes) and keep package.json in step.
export const GAME_VERSION = '1.20.0';

function showVersion() {
  var label = 'v' + GAME_VERSION;

  var login = document.getElementById('login');
  if (login) {
    var p = document.getElementById('login-version');
    if (!p) {
      p = document.createElement('p');
      p.id = 'login-version';
      login.appendChild(p);
    }
    p.textContent = label;
  }

  if (!document.getElementById('vt-version')) {
    var badge = document.createElement('div');
    badge.id = 'vt-version';
    badge.textContent = label;
    badge.style.cssText = 'position:fixed;right:4px;bottom:1px;' +
      'z-index:30;pointer-events:none;font:600 11px system-ui,-apple-system,sans-serif;' +
      'color:#fffbe8;text-shadow:0 1px 2px rgba(0,0,0,.6);opacity:.7;';
    document.body.appendChild(badge);
  }
  var badge = document.getElementById('vt-version');
  function updateBadge() { badge.hidden = !!login && login.style.display !== 'none' && !login.hidden; }
  updateBadge();
  if (login) new MutationObserver(updateBadge).observe(login, { attributes: true, attributeFilter: ['style', 'hidden'] });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showVersion);
else showVersion();
