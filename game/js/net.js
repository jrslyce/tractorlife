// game/js/net.js — login gate + autosave for Tractor Farm.
// Shared-secret auth (email + code) with an offline localStorage fallback.
// Written conservatively (no optional chaining) for older iPad Safari.

const AUTH_CODE = 'jadon';
const EMAIL_KEY = 'vt-email';
const OFFLINE_PREFIX = 'vt-offline:';
const SAVE_MS = 15000;
const LOGIN_TIMEOUT_MS = 6000;
const SAVE_TIMEOUT_MS = 8000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// credentials of the last successful login (used for /api/save bodies)
let sessionEmail = '';
let sessionCode = '';
let lastSent = '';
let autosaveStarted = false;

function normEmail(v) {
  const e = String(v == null ? '' : v).trim().toLowerCase();
  if (e.length === 0 || e.length > 120) return '';
  if (!EMAIL_RE.test(e)) return '';
  return e;
}

export function codeOK(v) {
  return String(v == null ? '' : v).trim().toLowerCase() === AUTH_CODE;
}

export function rememberedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) || '';
  } catch (err) {
    return '';
  }
}

function loadOffline(email) {
  try {
    const raw = localStorage.getItem(OFFLINE_PREFIX + email);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    return null;
  }
}

function mirrorOffline(email, raw) {
  try {
    localStorage.setItem(OFFLINE_PREFIX + email, raw);
  } catch (err) {
    /* storage full or blocked — ignore */
  }
}

function post(path, body, timeoutMs) {
  const payload = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
  let timer = null;
  if (typeof AbortController !== 'undefined') {
    const ctrl = new AbortController();
    payload.signal = ctrl.signal;
    timer = setTimeout(function () {
      ctrl.abort();
    }, timeoutMs);
  }
  return fetch(path, payload).then(
    function (res) {
      if (timer) clearTimeout(timer);
      return res;
    },
    function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    }
  );
}

// Resolves {mode:'online'|'offline', email, state}; rejects with a
// kid-readable Error message only when the code/email is definitively bad.
export function login(email, code) {
  const em = normEmail(email);
  if (!em) return Promise.reject(new Error('Enter your email like farmer@mail.com'));
  if (!codeOK(code)) return Promise.reject(new Error('Wrong secret code'));
  const body = { email: em, code: String(code) };

  return post('/api/login', body, LOGIN_TIMEOUT_MS)
    .then(function (res) {
      if (res.status === 401) throw new Error('wrong-code');
      if (!res.ok) throw new Error('server');
      return res.json().then(function (data) {
        sessionEmail = em;
        sessionCode = String(code).trim();
        lastSent = '';
        return {
          mode: 'online',
          email: (data && data.email) || em,
          state: (data && data.state) || null,
        };
      });
    })
    .catch(function (err) {
      // a definitive 401 blocks entry; anything else falls back to offline play
      if (err && err.message === 'wrong-code') throw new Error('Wrong secret code');
      sessionEmail = em;
      sessionCode = String(code).trim();
      return { mode: 'offline', email: em, state: loadOffline(em) };
    });
}

function tickSave(getSession, getState) {
  let session;
  try {
    session = getSession();
  } catch (err) {
    session = null;
  }
  if (!session) return;
  let state;
  try {
    state = getState();
  } catch (err) {
    return;
  }
  let raw;
  try {
    raw = JSON.stringify(state);
  } catch (err) {
    return;
  }
  mirrorOffline(session.email, raw);
  if (session.mode !== 'online') return;
  if (raw === lastSent) return;
  post('/api/save', { email: sessionEmail, code: sessionCode, state: state }, SAVE_TIMEOUT_MS)
    .then(function (res) {
      if (res.ok) lastSent = raw;
    })
    .catch(function (err) {
      /* retry next tick */
    });
}

// getSession() → {mode,email}|null, getState() → save object
export function startAutosave(getSession, getState) {
  if (autosaveStarted) return;
  autosaveStarted = true;

  setInterval(function () {
    tickSave(getSession, getState);
  }, SAVE_MS);

  window.addEventListener('pagehide', function () {
    let session;
    try {
      session = getSession();
    } catch (err) {
      session = null;
    }
    if (!session) return;
    let state;
    try {
      state = getState();
    } catch (err) {
      return;
    }
    let raw;
    try {
      raw = JSON.stringify(state);
    } catch (err) {
      return;
    }
    mirrorOffline(session.email, raw);
    if (session.mode !== 'online' || raw === lastSent) return;
    if (typeof navigator.sendBeacon !== 'function') return;
    try {
      const body = JSON.stringify({ email: sessionEmail, code: sessionCode, state: state });
      navigator.sendBeacon('/api/save', new Blob([body], { type: 'application/json' }));
    } catch (err) {
      /* ignore */
    }
  });
}