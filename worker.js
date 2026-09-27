// TractorLife worker: secret-backed login sessions + per-player saves in a Durable Object.
// Static game assets are served by env.ASSETS; all /api/* routes are handled here.

const MAX_STATE_LENGTH = 524288;
const MAX_REQUEST_LENGTH = MAX_STATE_LENGTH + 4096;
const SESSION_COOKIE = "__Host-vt-session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// How long a farmer stays on the /api/farmers list after their last login.
const FARMER_RECENT_MS = 30 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

function json(data, status, headers) {
  const responseHeaders = new Headers(headers || {});
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: responseHeaders,
  });
}

// Trim, lowercase, must look like an email and be <= 120 chars. Returns null if invalid.
function normalizeEmail(email) {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 120) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch (err) {
    return null;
  }
}

async function sessionKey(env) {
  if (typeof env.SESSION_SECRET !== "string" || env.SESSION_SECRET.length < 32) return null;
  return crypto.subtle.importKey(
    "raw", encoder.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

async function checkCode(code, env) {
  if (typeof env.AUTH_CODE !== "string" || !env.AUTH_CODE.trim()) return false;
  const candidate = String(code === undefined || code === null ? "" : code).trim().toLowerCase();
  const expected = env.AUTH_CODE.trim().toLowerCase();
  if (!candidate || candidate.length > 256) return false;
  const inputHash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(candidate)));
  const expectedHash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(expected)));
  let mismatch = 0;
  for (let i = 0; i < inputHash.length; i++) mismatch |= inputHash[i] ^ expectedHash[i];
  return mismatch === 0;
}

function cookieValue(request, name) {
  const header = request.headers.get("cookie") || "";
  const parts = header.split(";");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    const equals = part.indexOf("=");
    if (equals > 0 && part.slice(0, equals) === name) return part.slice(equals + 1);
  }
  return "";
}

async function readSession(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const key = await sessionKey(env);
  if (!key) return null;
  const payloadBytes = base64UrlDecode(token.slice(0, dot));
  const signature = base64UrlDecode(token.slice(dot + 1));
  if (!payloadBytes || !signature) return null;
  let valid = false;
  try {
    valid = await crypto.subtle.verify("HMAC", key, signature, payloadBytes);
  } catch (err) {
    return null;
  }
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!normalizeEmail(payload.email)) return null;
    if (payload.exp !== 0 && (!Number.isSafeInteger(payload.exp) || payload.exp <= Date.now())) return null;
    return { email: payload.email, exp: payload.exp };
  } catch (err) {
    return null;
  }
}

async function issueSession(email, remember, env) {
  const key = await sessionKey(env);
  if (!key) return null;
  const exp = remember ? Date.now() + SESSION_MAX_AGE * 1000 : 0;
  const payload = encoder.encode(JSON.stringify({ email: email, exp: exp }));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  const token = base64UrlEncode(payload) + "." + base64UrlEncode(signature);
  const maxAge = remember ? "; Max-Age=" + SESSION_MAX_AGE : "";
  return SESSION_COOKIE + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Strict" + maxAge;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_LENGTH) {
    throw new Error("payload-too-large");
  }
  const reader = request.body && request.body.getReader();
  if (!reader) throw new Error("bad-request");
  const chunks = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > MAX_REQUEST_LENGTH) {
      await reader.cancel();
      throw new Error("payload-too-large");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    bytes.set(chunks[i], offset);
    offset += chunks[i].byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function assignFarmSlot(email) {
  var hash = 0;
  for (var i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash) + email.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % 10;
}

export class GameSaves {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/save") {
      let body = {};
      try {
        body = await request.json();
      } catch (err) {
        body = {};
      }
      if (!isPlainObject(body)) body = {};
      const state = body.state === undefined ? null : body.state;
      const raw = JSON.stringify(state);
      await this.ctx.storage.put("state", raw);
      return json({ ok: true });
    }

    // Otherwise: load.
    const raw = await this.ctx.storage.get("state");
    return json({ ok: true, state: raw ? JSON.parse(raw) : null });
  }
}

export class FarmerList {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/list") {
      // ctx.storage.list() resolves to a Map<email, json-string>, not an
      // array — iterating `map.keys.length` would silently yield nothing.
      var entries = await this.ctx.storage.list();
      var cutoff = Date.now() - FARMER_RECENT_MS;
      var farmers = [];
      entries.forEach(function (raw, email) {
        var parsed = raw;
        try {
          if (typeof parsed === "string") parsed = JSON.parse(parsed);
        } catch (err) {
          return;
        }
        if (!parsed || typeof parsed !== "object") return;
        if (typeof parsed.lastSeen === "number" && parsed.lastSeen < cutoff) return;
        farmers.push({
          email: email,
          lastSeen: parsed.lastSeen,
          farmSlot: typeof parsed.farmSlot === "number" ? parsed.farmSlot : 0,
        });
      });
      farmers.sort(function(a, b) { return a.farmSlot - b.farmSlot; });
      return json({ ok: true, farmers: farmers });
    }

    if (request.method === "POST" && url.pathname === "/update") {
      var body = await request.json();
      var email = body.email;
      var farmSlot = body.farmSlot;
      await this.ctx.storage.put(email, JSON.stringify({
        lastSeen: Date.now(),
        farmSlot: farmSlot
      }));
      return json({ ok: true });
    }

    return json({ ok: false, error: "not found" }, 404);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/logout") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "method not allowed" }, 405);
      }
      return json({ ok: true }, 200, {
        "set-cookie": SESSION_COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
      });
    }

    if (url.pathname === "/api/login" || url.pathname === "/api/save") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "method not allowed" }, 405);
      }

      let body = {};
      try {
        body = await readJsonBody(request);
      } catch (err) {
        if (err && err.message === "payload-too-large") {
          return json({ ok: false, error: "request too large" }, 413);
        }
        return json({ ok: false, error: "bad request" }, 400);
      }
      if (!isPlainObject(body)) body = {};

      const email = normalizeEmail(body.email);
      if (!email) {
        return json({ ok: false, error: "bad email" }, 400);
      }

      if (url.pathname === "/api/save") {
        const session = await readSession(request, env);
        if (!session || session.email !== email) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }
        const id = env.SAVES.idFromName(email);
        const stub = env.SAVES.get(id);
        const state = body.state;
        if (!isPlainObject(state)) {
          return json({ ok: false, error: "bad state" }, 400);
        }
        if (JSON.stringify(state).length > MAX_STATE_LENGTH) {
          return json({ ok: false, error: "state too large" }, 413);
        }
        return stub.fetch("https://saves/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: state }),
        });
      }

      // /api/login
      const hasCode = typeof body.code === "string" && body.code.trim() !== "";
      if (hasCode) {
        if (typeof env.AUTH_CODE !== "string" || !env.AUTH_CODE.trim()) {
          return json({ ok: false, error: "authentication is not configured" }, 503);
        }
        if (!await checkCode(body.code, env)) {
          return json({ ok: false, error: "wrong code" }, 401);
        }
      } else {
        const session = await readSession(request, env);
        if (!session || session.email !== email) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }
      }
      const setCookie = await issueSession(email, body.remember === true, env);
      if (!setCookie) {
        return json({ ok: false, error: "authentication is not configured" }, 503);
      }
      const id = env.SAVES.idFromName(email);
      const stub = env.SAVES.get(id);
      const res = await stub.fetch("https://saves/load");
      const data = await res.json();
      const farmSlot = assignFarmSlot(email);
      // Update farmer list. A DurableObjectNamespace has no .fetch() of its
      // own — you must resolve an instance first. The list is a singleton
      // keyed by a fixed name so every player reads the same record.
      // A farmer-list failure must never fail the login itself.
      try {
        await env.FARMERS.get(env.FARMERS.idFromName("farmers")).fetch("https://farmers/update", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: email, farmSlot: farmSlot }),
        });
      } catch (err) {
        console.log("farmer-list update failed: " + (err && err.message));
      }
      return json({ ok: true, email: email, farmSlot: farmSlot, state: data.state }, 200, { "set-cookie": setCookie });
    }

    if (url.pathname === "/api/farmers") {
      if (request.method !== "GET") {
        return json({ ok: false, error: "method not allowed" }, 405);
      }
      try {
        return await env.FARMERS.get(env.FARMERS.idFromName("farmers")).fetch("https://farmers/list");
      } catch (err) {
        return json({ ok: true, farmers: [] });
      }
    }

    // One foreign farm's fields, for cross-farm rendering (plan 5.3).
    // The session identifies the caller — the body only carries the slot and
    // needs no email. The reply exposes ONLY that farm's {farmSlot, fields}:
    // never money, never the owner's session or the rest of their world.
    if (url.pathname === "/api/farm-state") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "method not allowed" }, 405);
      }
      const session = await readSession(request, env);
      if (!session) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
      let body = {};
      try {
        body = await request.json();
      } catch (err) {
        body = {};
      }
      if (!isPlainObject(body)) body = {};
      const slot = typeof body.slot === "number" && Number.isFinite(body.slot)
        ? Math.floor(body.slot)
        : -1;
      if (slot < 0 || slot > 9) {
        return json({ ok: true, email: null, farm: null });
      }

      // slot -> occupant email via the farmer-list singleton
      let email = null;
      try {
        const listRes = await env.FARMERS.get(env.FARMERS.idFromName("farmers")).fetch("https://farmers/list");
        const list = await listRes.json();
        const farmers = list && Array.isArray(list.farmers) ? list.farmers : [];
        for (let i = 0; i < farmers.length; i++) {
          const f = farmers[i];
          if (!f || typeof f.farmSlot !== "number" || Math.floor(f.farmSlot) !== slot) continue;
          if (typeof f.email !== "string" || !f.email) continue;
          email = f.email;
          break;
        }
      } catch (err) {
        email = null;
      }
      if (!email) {
        return json({ ok: true, email: null, farm: null });
      }

      // The owner's save; malformed / absent state degrades to farm:null
      // rather than throwing.
      let farm = null;
      try {
        const saveRes = await env.SAVES.get(env.SAVES.idFromName(email)).fetch("https://saves/load");
        const data = await saveRes.json();
        const state = data && data.state && typeof data.state === "object" ? data.state : null;
        const world = state && isPlainObject(state.world) ? state.world : null;
        const farms = world && Array.isArray(world.farms) ? world.farms : [];
        for (let i = 0; i < farms.length; i++) {
          const f = farms[i];
          if (!isPlainObject(f) || typeof f.farmSlot !== "number" || Math.floor(f.farmSlot) !== slot) continue;
          if (!Array.isArray(f.fields)) break;
          farm = { farmSlot: f.farmSlot, fields: f.fields };
          break;
        }
      } catch (err) {
        farm = null;
      }
      return json({ ok: true, email: email, farm: farm });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
