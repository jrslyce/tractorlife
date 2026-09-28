// game/js/version.js — the game's version number, shown on the login screen
// and as a small badge in-game. Bump GAME_VERSION with each release
// (1.0 -> 1.1 for new features, 1.0.1 for fixes) and keep package.json in step.
export const GAME_VERSION = '1.11.0';

function showVersion() {
  var label = 'v' + GAME_VERSION;

  var login = document.getElementById('login');
  if (login && !document.getElementById('login-version')) {
    var p = document.createElement('p');
    p.id = 'login-version';
    p.textContent = label;
    p.style.cssText = 'margin:18px 0 0;font-size:14px;color:#d8e8c8;opacity:.75;';
    login.appendChild(p);
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
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showVersion);
else showVersion();
