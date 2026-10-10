// game/js/net.js — login gate + autosave for Tractor Farm.
// Cookie-backed auth (email + code) with an offline localStorage fallback.
// Written conservatively (no optional chaining) for older iPad Safari.
import { ITEM_BY_ID } from './items.js';

const EMAIL_KEY = 'vt-email';
const LEGACY_CODE_KEY = 'vt-code';
const OFFLINE_PREFIX = 'vt-offline:';
const WORLD_QUEUE_KEY = 'vt-shared-road-queue';
const SAVE_MS = 15000;
const LOGIN_TIMEOUT_MS = 6000;
const SAVE_TIMEOUT_MS = 8000;
const FARMERS_TIMEOUT_MS = 5000;
const FARM_STATE_TIMEOUT_MS = 5000;
const WORLD_TIMEOUT_MS = 5000;
const TERRAIN_EDIT_TIMEOUT_MS = 8000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// email of the active session (used for /api/save bodies)
let sessionEmail = '';
let lastSent = '';
let autosaveStarted = false;
let pendingLogout = Promise.resolve();

function normEmail(v) {
  const e = String(v == null ? '' : v).trim().toLowerCase();
  if (e.length === 0 || e.length > 120) return '';
  if (!EMAIL_RE.test(e)) return '';
  return e;
}

export function codeOK(v) {
  return String(v == null ? '' : v).trim().length > 0;
}

export function rememberedEmail() {
  try {
    // Remove the passcode saved by older builds; it must never be retained client-side.
    localStorage.removeItem(LEGACY_CODE_KEY);
    return localStorage.getItem(EMAIL_KEY) || '';
  } catch (err) {
    return '';
  }
}

export function hasRememberedEmail() {
  return rememberedEmail() !== '';
}

export function forgetRememberedCredentials() {
  try {
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(LEGACY_CODE_KEY);
  } catch (err) {
    /* storage may be blocked */
  }
  try {
    pendingLogout = post('/api/logout', {}, LOGIN_TIMEOUT_MS).then(function () {}, function () {});
  } catch (err) {
    /* offline or fetch unavailable */
  }
  return pendingLogout;
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
// The Worker keeps the session in an HttpOnly cookie. Only the email is stored
// locally so a remembered session can be restored without saving the passcode.
export function login(email, code, remember) {
  const clearSession = remember ? pendingLogout : forgetRememberedCredentials();
  const em = normEmail(email);
  if (!em) return Promise.reject(new Error('Enter your email like farmer@mail.com'));
  if (!codeOK(code)) return Promise.reject(new Error('Wrong secret code'));
  const body = { email: em, code: String(code).trim(), remember: remember === true };

  return clearSession.catch(function () { return null; })
    .then(function () { return post('/api/login', body, LOGIN_TIMEOUT_MS); })
    .then(function (res) {
      if (res.status === 401) throw new Error('wrong-code');
      if (!res.ok) throw new Error('server');
      return res.json().then(function (data) {
        sessionEmail = em;
        lastSent = '';
        if (remember) {
          try { localStorage.setItem(EMAIL_KEY, em); } catch (err) { /* ignore */ }
        }
        return {
          mode: 'online',
          email: (data && data.email) || em,
          farmSlot: (data && typeof data.farmSlot === 'number') ? data.farmSlot : -1,
          state: (data && data.state) || null,
        };
      });
    })
    .catch(function (err) {
      // a definitive 401 blocks entry; anything else falls back to offline play
      if (err && err.message === 'wrong-code') throw new Error('Wrong secret code');
      sessionEmail = em;
      if (remember) {
        try { localStorage.setItem(EMAIL_KEY, em); } catch (storageErr) { /* ignore */ }
      }
      return { mode: 'offline', email: em, farmSlot: -1, state: loadOffline(em) };
    });
}

// Resume a remembered server session; this deliberately has no offline fallback.
export function restoreRememberedSession(email) {
  const em = normEmail(email);
  if (!em) return Promise.reject(new Error('Enter your email like farmer@mail.com'));
  return post('/api/login', { email: em, remember: true }, LOGIN_TIMEOUT_MS).then(function (res) {
    if (res.status === 401) throw new Error('session-expired');
    if (!res.ok) throw new Error('server');
    return res.json().then(function (data) {
      sessionEmail = em;
      lastSent = '';
      return {
        mode: 'online',
        email: (data && data.email) || em,
        farmSlot: (data && typeof data.farmSlot === 'number') ? data.farmSlot : -1,
        state: (data && data.state) || null,
      };
    });
  });
}

// Fetch the list of active farmers.
// worker.js only allows GET /api/farmers (POST is answered with 405), so this
// must be a plain GET with an abort timeout, same [] fallback as before.
export function fetchFarmers() {
  const payload = { method: 'GET' };
  let timer = null;
  if (typeof AbortController !== 'undefined') {
    const ctrl = new AbortController();
    payload.signal = ctrl.signal;
    timer = setTimeout(function () {
      ctrl.abort();
    }, FARMERS_TIMEOUT_MS);
  }
  const clear = function () {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return fetch('/api/farmers', payload).then(
    function (res) {
      clear();
      if (!res.ok) return [];
      return res.json().then(
        function (data) {
          return (data && Array.isArray(data.farmers)) ? data.farmers : [];
        },
        function () {
          return [];
        }
      );
    },
    function () {
      clear();
      return [];
    }
  ).catch(function () {
    clear();
    return [];
  });
}

// Fetch one foreign farm's authoritative state: {ok, email, farm:{farmSlot,
// fields}} or {ok, email, farm:null} when nobody occupies the slot. Resolves
// null on ANY failure (offline, 401, timeout, malformed body) so callers can
// stay silent and keep ticking the local fields.
export function fetchFarmState(slot) {
  return post('/api/farm-state', { slot: slot }, FARM_STATE_TIMEOUT_MS).then(
    function (res) {
      if (!res.ok) return null;
      return res.json().then(
        function (data) {
          if (!data || data.ok !== true || !data.farm || typeof data.farm !== 'object') {
            return null;
          }
          if (!Array.isArray(data.farm.fields)) return null;
          return data;
        },
        function () {
          return null;
        }
      );
    },
    function () {
      return null;
    }
  ).catch(function () {
    return null;
  });
}

export function fetchSharedWorld() {
  const payload = { method: 'GET' };
  let timer = null;
  if (typeof AbortController !== 'undefined') {
    const ctrl = new AbortController();
    payload.signal = ctrl.signal;
    timer = setTimeout(function () { ctrl.abort(); }, WORLD_TIMEOUT_MS);
  }
  return fetch('/api/world', payload).then(function (res) {
    if (timer) clearTimeout(timer);
    if (!res.ok) return null;
    return res.json().then(function (data) {
      if (!data || data.ok !== true || !Array.isArray(data.roads)) return null;
      return flushSharedRoadQueue().then(function () {
        var queued = readRoadQueue();
        for (var i = 0; i < queued.length; i++) data.roads.push(queued[i]);
        return data;
      });
    }, function () { return null; });
  }, function () {
    if (timer) clearTimeout(timer);
    return null;
  }).catch(function () {
    if (timer) clearTimeout(timer);
    return null;
  });
}

export function placeSharedRoad(tile) {
  if (!tile || typeof tile.id !== 'string' || !Number.isInteger(tile.x) || !Number.isInteger(tile.z)) {
    return Promise.resolve(null);
  }
  var cleanTile = { id: tile.id, x: tile.x, z: tile.z };
  return post('/api/world/place', cleanTile, WORLD_TIMEOUT_MS).then(function (res) {
    if (!res.ok) { if (isRetryableStatus(res.status)) queueSharedRoad(cleanTile); return null; }
    return res.json().then(function (data) {
      if (!data || !data.ok) queueSharedRoad(cleanTile);
      return data && data.ok ? data : null;
    }, function () { queueSharedRoad(cleanTile); return null; });
  }, function () { queueSharedRoad(cleanTile); return null; }).catch(function () {
    queueSharedRoad(cleanTile);
    return null;
  });
}

export function sendGift(to, itemId, qty) {
  const recipient = normEmail(to);
  const amount = Math.floor(Number(qty));
  if (!recipient || !ITEM_BY_ID[itemId] || !Number.isInteger(amount) || amount < 1 || amount > 20) {
    return Promise.resolve({ ok: false, error: 'Invalid gift details.' });
  }
  return post('/api/gift', { to: recipient, itemId: itemId, qty: amount }, WORLD_TIMEOUT_MS).then(function (res) {
    return res.json().then(function (data) {
      if (!res.ok || !data || data.ok !== true) return { ok: false, error: data && data.error ? data.error : 'Gift could not be sent.' };
      return data;
    }, function () { return { ok: false, error: 'Gift could not be sent.' }; });
  }, function () { return { ok: false, error: 'Gift could not be sent.' }; }).catch(function () {
    return { ok: false, error: 'Gift could not be sent.' };
  });
}

// Submit one authoritative terrain mutation. A null session or non-online
// session is explicitly offline: local prediction must not treat it as accepted.
export function sendTerrainEdit(edit, session) {
  if (!session || session.mode !== 'online') {
    return Promise.resolve({ ok: false, offline: true, error: 'Terrain edits require an online session.' });
  }
  if (!edit || !['break', 'place'].includes(edit.action) ||
      ![edit.x, edit.y, edit.z, edit.expectedRevision].every(Number.isSafeInteger) ||
      edit.expectedRevision < 0 || (edit.action === 'place' && typeof edit.material !== 'string') ||
      (edit.material !== undefined && typeof edit.material !== 'string') ||
      (edit.toolId !== undefined && (typeof edit.toolId !== 'string' || edit.toolId.length > 64))) {
    return Promise.resolve({ ok: false, error: 'Invalid terrain edit.' });
  }
  var operationId = edit.operationId;
  if (operationId === undefined) {
    try {
      operationId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '')
        : 'op_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    } catch (err) { operationId = 'op_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2); }
  }
  if (typeof operationId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(operationId)) {
    return Promise.resolve({ ok: false, error: 'Invalid terrain operation ID.' });
  }
  var body = { operationId: operationId, action: edit.action, x: edit.x, y: edit.y, z: edit.z, expectedRevision: edit.expectedRevision };
  if (edit.material !== undefined) body.material = edit.material;
  if (edit.toolId !== undefined) body.toolId = edit.toolId;
  return post('/api/terrain/edit', body, TERRAIN_EDIT_TIMEOUT_MS).then(function (res) {
    return res.json().then(function (data) {
      if (!res.ok || !data || data.ok !== true || !data.edit || typeof data.edit !== 'object' ||
          !Number.isSafeInteger(data.revision) || data.edit.revision !== data.revision || !data.inventory || typeof data.inventory !== 'object') {
        return { ok: false, offline: false, status: res.status, error: data && typeof data.error === 'string' ? data.error : 'Terrain edit was not accepted.' };
      }
      return { ok: true, accepted: true, operationId: operationId, edit: data.edit, revision: data.revision, inventory: data.inventory };
    }, function () { return { ok: false, offline: false, status: res.status, error: 'Invalid terrain edit response.' }; });
  }, function () { return { ok: false, offline: true, error: 'Terrain edit could not reach the server.' }; }).catch(function () {
    return { ok: false, offline: true, error: 'Terrain edit could not reach the server.' };
  });
}

export function fetchTerrainState(session) {
  if (!session || session.mode !== 'online') return Promise.resolve(null);
  return fetch('/api/terrain/state', { method: 'GET', credentials: 'same-origin' }).then(function (res) {
    if (!res.ok) return null;
    return res.json().then(function (data) {
      if (!data || data.ok !== true || !Number.isSafeInteger(data.terrainRevision) ||
          !data.terrainEdits || typeof data.terrainEdits !== 'object' || Array.isArray(data.terrainEdits)) return null;
      return data;
    }, function () { return null; });
  }, function () { return null; }).catch(function () { return null; });
}

// Only transient failures are worth retrying. A 4xx such as "not public
// land" (403) or "invalid tile" (400) will never succeed, so re-queuing it
// would retry it on every sync forever.
function isRetryableStatus(status) {
  return status === 401 || status === 408 || status === 429 || status >= 500;
}

function readRoadQueue() {
  try {
    var data = JSON.parse(localStorage.getItem(WORLD_QUEUE_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch (err) { return []; }
}

function saveRoadQueue(queue) {
  try { localStorage.setItem(WORLD_QUEUE_KEY, JSON.stringify(queue)); } catch (err) { /* storage may be unavailable */ }
}

function queueSharedRoad(tile) {
  var queue = readRoadQueue();
  for (var i = 0; i < queue.length; i++) if (queue[i].x === tile.x && queue[i].z === tile.z) return;
  if (queue.length < 5000) { queue.push(tile); saveRoadQueue(queue); }
}

function flushSharedRoadQueue() {
  var queue = readRoadQueue();
  if (!queue.length) return Promise.resolve();
  var remaining = [];
  var chain = Promise.resolve();
  queue.forEach(function (tile) {
    chain = chain.then(function () {
      return post('/api/world/place', tile, WORLD_TIMEOUT_MS).then(function (res) {
        if (!res.ok && isRetryableStatus(res.status)) remaining.push(tile);
      }, function () { remaining.push(tile); });
    });
  });
  return chain.then(function () { saveRoadQueue(remaining); });
}

export function tickSave(getSession, getState) {
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
  post('/api/save', { email: sessionEmail, state: state }, SAVE_TIMEOUT_MS)
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
      const body = JSON.stringify({ email: sessionEmail, state: state });
      navigator.sendBeacon('/api/save', new Blob([body], { type: 'application/json' }));
    } catch (err) {
      /* ignore */
    }
  });
}
