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
const GIFT_ITEMS = {
  asphalt: { price: 4, emoji: "⬛" }, gravel: { price: 2, emoji: "◽" }, brick: { price: 6, emoji: "🧱" },
  wood: { price: 12, emoji: "🪵" }, roof_shingles: { price: 90, emoji: "🏠" }, fence_kit: { price: 80, emoji: "🚧" },
  window_glass: { price: 65, emoji: "🪟" }, door: { price: 70, emoji: "🚪" }, lamp_light: { price: 55, emoji: "💡" },
  string_lights: { price: 95, emoji: "✨" }, fertilizer: { price: 25, emoji: "🪴" }, corn_seeds: { price: 15, emoji: "🌽" },
  wheat_seeds: { price: 10, emoji: "🌾" }, pumpkin_seeds: { price: 25, emoji: "🎃" }, sunflower_seeds: { price: 18, emoji: "🌻" },
  pea_seeds: { price: 8, emoji: "🟢" }, paint: { price: 30, emoji: "🎨" }, hay_bale: { price: 28, emoji: "🟨" },
  scarecrow: { price: 60, emoji: "🧑‍🌾" }, pumpkin_pile: { price: 75, emoji: "🎃" }, corn_shocks: { price: 48, emoji: "🌽" }, mailbox: { price: 42, emoji: "📮" },
};

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

    if (request.method === "POST" && url.pathname === "/gift-debit") {
      let body = {};
      try { body = await request.json(); } catch (err) { return json({ ok: false, error: "bad request" }, 400); }
      const item = body && GIFT_ITEMS[body.itemId];
      const qty = body && body.qty;
      const requestId = body && body.requestId;
      if (!item || !Number.isInteger(qty) || qty < 1 || qty > 20 ||
          typeof requestId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(requestId) || !normalizeEmail(body.to)) {
        return json({ ok: false, error: "invalid gift" }, 400);
      }
      const transactionKey = "gift-txn:" + requestId;
      const existing = await this.ctx.storage.get(transactionKey);
      const transfer = { requestId: requestId, to: body.to, itemId: body.itemId, qty: qty, total: item.price * qty };
      if (existing) {
        if (existing.to !== transfer.to || existing.itemId !== transfer.itemId || existing.qty !== transfer.qty) {
          return json({ ok: false, error: "request id conflict" }, 409);
        }
        if (existing.status === "refunded") return json({ ok: false, error: "gift was refunded" }, 409);
        return json({ ok: true, status: existing.status, total: existing.total });
      }
      const raw = await this.ctx.storage.get("state");
      let state;
      try { state = raw ? JSON.parse(raw) : null; } catch (err) { state = null; }
      if (!isPlainObject(state) || typeof state.money !== "number" || !Number.isFinite(state.money)) {
        return json({ ok: false, error: "no saved balance" }, 409);
      }
      if (state.money < transfer.total) return json({ ok: false, error: "not enough money" }, 409);
      state.money = Math.max(0, Math.floor(state.money - transfer.total));
      await this.ctx.storage.put({
        state: JSON.stringify(state),
        [transactionKey]: Object.assign({}, transfer, { status: "debited", from: body.from || "" })
      });
      return json({ ok: true, status: "debited", total: transfer.total });
    }

    if (request.method === "POST" && url.pathname === "/gift-credit") {
      let body = {};
      try { body = await request.json(); } catch (err) { return json({ ok: false, error: "bad request" }, 400); }
      const item = body && GIFT_ITEMS[body.itemId];
      if (!item || !Number.isInteger(body.qty) || body.qty < 1 || body.qty > 20 ||
          typeof body.requestId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(body.requestId) || !normalizeEmail(body.from)) {
        return json({ ok: false, error: "invalid gift" }, 400);
      }
      const receivedKey = "gift-received:" + body.requestId;
      const existing = await this.ctx.storage.get(receivedKey);
      if (existing) return json({ ok: true, duplicate: true });
      const raw = await this.ctx.storage.get("state");
      let state;
      try { state = raw ? JSON.parse(raw) : null; } catch (err) { state = null; }
      if (!isPlainObject(state)) state = { v: 3, money: 0 };
      if (!isPlainObject(state.inventory) || !Array.isArray(state.inventory.slots)) {
        state.inventory = { v: 1, selectedSlot: -1, slots: new Array(9).fill(null) };
      }
      const slots = state.inventory.slots;
      let target = -1;
      for (let i = 0; i < slots.length; i++) {
        if (slots[i] && slots[i].itemId === body.itemId) { target = i; break; }
      }
      if (target < 0) {
        for (let i = 0; i < slots.length; i++) if (!slots[i]) { target = i; break; }
      }
      if (target < 0) return json({ ok: false, error: "recipient inventory is full" }, 409);
      if (slots[target] && (Number(slots[target].qty) || 0) + body.qty > 999) return json({ ok: false, error: "recipient stack is full" }, 409);
      if (slots[target]) slots[target].qty = Math.max(0, Number(slots[target].qty) || 0) + body.qty;
      else slots[target] = { itemId: body.itemId, qty: body.qty, emoji: item.emoji };
      const inbox = Array.isArray(state.giftInbox) ? state.giftInbox.slice(-19) : [];
      inbox.push({ requestId: body.requestId, from: body.from, itemId: body.itemId, qty: body.qty, at: Date.now() });
      state.giftInbox = inbox;
      const appliedGiftIds = Array.isArray(state.appliedGiftIds) ? state.appliedGiftIds.slice(-99) : [];
      if (appliedGiftIds.indexOf(body.requestId) === -1) appliedGiftIds.push(body.requestId);
      state.appliedGiftIds = appliedGiftIds;
      await this.ctx.storage.put({ state: JSON.stringify(state), [receivedKey]: true });
      return json({ ok: true });
    }

    if (request.method === "POST" && (url.pathname === "/gift-complete" || url.pathname === "/gift-refund")) {
      let body = {};
      try { body = await request.json(); } catch (err) { return json({ ok: false, error: "bad request" }, 400); }
      const requestId = body && body.requestId;
      if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) return json({ ok: false, error: "invalid request id" }, 400);
      const key = "gift-txn:" + requestId;
      const transaction = await this.ctx.storage.get(key);
      if (!transaction) return json({ ok: false, error: "gift not found" }, 404);
      if (url.pathname === "/gift-refund" && transaction.status === "debited") {
        const raw = await this.ctx.storage.get("state");
        let state;
        try { state = raw ? JSON.parse(raw) : null; } catch (err) { state = null; }
        if (isPlainObject(state)) {
          state.money = Math.max(0, Number(state.money) || 0) + transaction.total;
          transaction.status = "refunded";
          await this.ctx.storage.put({ state: JSON.stringify(state), [key]: transaction });
        }
      } else if (url.pathname === "/gift-complete") {
        transaction.status = "complete";
        await this.ctx.storage.put(key, transaction);
      }
      return json({ ok: true, status: transaction.status });
    }

    if (request.method === "POST" && url.pathname === "/save") {
      let body = {};
      try {
        body = await request.json();
      } catch (err) {
        body = {};
      }
      if (!isPlainObject(body)) body = {};
      const state = body.state === undefined ? null : body.state;
      const oldRaw = await this.ctx.storage.get("state");
      let oldState = null;
      try { oldState = oldRaw ? JSON.parse(oldRaw) : null; } catch (err) { oldState = null; }
      if (isPlainObject(state) && isPlainObject(oldState) && Array.isArray(oldState.giftInbox)) {
        const inbox = Array.isArray(state.giftInbox) ? state.giftInbox.slice() : [];
        const ids = {};
        for (let i = 0; i < inbox.length; i++) if (inbox[i] && inbox[i].requestId) ids[inbox[i].requestId] = true;
        for (let i = 0; i < oldState.giftInbox.length; i++) {
          const gift = oldState.giftInbox[i];
          if (gift && gift.requestId && !ids[gift.requestId]) inbox.push(gift);
        }
        state.giftInbox = inbox.slice(-20);
      }
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

// Shared public road tiles. A single named Durable Object serializes writes,
// making placement idempotent without replacing the entire shared snapshot.
export class SharedWorld {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/read") {
      const roads = await this.ctx.storage.get("roads") || {};
      const entries = Object.keys(roads).map((key) => roads[key]);
      return json({ ok: true, roads: entries, stamp: await this.ctx.storage.get("stamp") || 0 });
    }
    if (request.method === "POST" && url.pathname === "/place") {
      let body;
      try {
        if (Number(request.headers.get("content-length") || 0) > 2048) return json({ ok: false, error: "too large" }, 413);
        body = await request.json();
      } catch (err) {
        return json({ ok: false, error: "bad request" }, 400);
      }
      if (!isPlainObject(body) || !["asphalt", "gravel", "brick"].includes(body.id) ||
          !Number.isSafeInteger(body.x) || !Number.isSafeInteger(body.z) ||
          body.x < -10 || body.x > 1385 || body.z < -78 || body.z > 80) {
        return json({ ok: false, error: "invalid tile" }, 400);
      }
      // Reject tiles inside any farm bounds; only public land can be shared road.
      for (let slot = 0; slot < 10; slot++) {
        const minX = slot * 140 - 6;
        const maxX = slot * 140 + 105.5;
        if (body.x >= minX && body.x <= maxX && body.z >= -72.5 && body.z <= 27.5) {
          return json({ ok: false, error: "roads may only be placed on public land" }, 403);
        }
      }
      const key = body.x + "," + body.z;
      const roads = await this.ctx.storage.get("roads") || {};
      if (!roads[key] && Object.keys(roads).length >= 5000) return json({ ok: false, error: "shared road limit reached" }, 429);
      roads[key] = { id: body.id, x: body.x, z: body.z };
      const stamp = (await this.ctx.storage.get("stamp") || 0) + 1;
      await this.ctx.storage.put({ roads: roads, stamp: stamp });
      return json({ ok: true, tile: roads[key], stamp: stamp });
    }
    return json({ ok: false, error: "not found" }, 404);
  }
}

// One low-volume WebSocket room for live player poses and build events.
export class RealtimeRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/broadcast") {
      let body;
      try { body = await request.json(); } catch (err) { return json({ ok: false }, 400); }
      if (!isPlainObject(body) || body.type !== "gift" || !normalizeEmail(body.from) || !normalizeEmail(body.to) ||
          !GIFT_ITEMS[body.itemId] || !Number.isInteger(body.qty) || body.qty < 1 || body.qty > 20 ||
          typeof body.requestId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(body.requestId)) {
        return json({ ok: false }, 400);
      }
      this._broadcast({ type: "gift", from: body.from, to: body.to, itemId: body.itemId, qty: body.qty, requestId: body.requestId }, null);
      return json({ ok: true });
    }
    if (url.pathname !== "/connect" || request.headers.get("upgrade") !== "websocket") {
      return json({ ok: false, error: "websocket upgrade required" }, 426);
    }
    const email = url.searchParams.get("email");
    if (!normalizeEmail(email)) return json({ ok: false, error: "bad identity" }, 400);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ email: email, lastAt: 0 });
    server.send(JSON.stringify({ type: "hello", email: email }));
    this._broadcast({ type: "join", email: email }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, raw) {
    const attachment = socket.deserializeAttachment() || {};
    const now = Date.now();
    if (now - (attachment.lastAt || 0) < 50) return;
    attachment.lastAt = now;
    socket.serializeAttachment(attachment);
    if ((typeof raw === "string" ? raw.length : raw.byteLength) > 8192) return;
    let msg;
    try { msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); }
    catch (err) { return; }
    if (!isPlainObject(msg)) return;
    if (msg.type === "pose") {
      const pose = msg.pose;
      if (!isPlainObject(pose) || !Number.isFinite(pose.x) || !Number.isFinite(pose.z) ||
          !Number.isFinite(pose.theta) || pose.x < -10 || pose.x > 1385 || pose.z < -78 || pose.z > 80 ||
          !["walking", "driving"].includes(pose.mode) ||
          (pose.machine !== null && !["tractor", "combine", "truck"].includes(pose.machine))) return;
      this._broadcast({ type: "pose", email: attachment.email, pose: {
        x: pose.x, z: pose.z, theta: pose.theta, mode: pose.mode,
        machine: pose.machine || null, color: typeof pose.color === "string" ? pose.color.slice(0, 20) : ""
      } }, socket);
      return;
    }
    if (msg.type === "build") {
      const entry = msg.entry;
      const roads = ["asphalt", "gravel", "brick"];
      if (!isPlainObject(entry) || !["asphalt", "gravel", "brick", "wood", "roof_shingles", "fence_kit", "window_glass", "door", "lamp_light", "hay_bale", "scarecrow", "pumpkin_pile", "corn_shocks", "string_lights", "mailbox"].includes(entry.id) ||
          !Number.isSafeInteger(entry.x) || !Number.isSafeInteger(entry.z) ||
          entry.x < -10 || entry.x > 1385 || entry.z < -78 || entry.z > 80) return;
      const ownerSlot = assignFarmSlot(attachment.email);
      let inFarm = false;
      for (let slot = 0; slot < 10; slot++) {
        const minX = slot * 140 - 6;
        const maxX = slot * 140 + 105.5;
        if (entry.x >= minX && entry.x <= maxX && entry.z >= -72.5 && entry.z <= 27.5) inFarm = true;
      }
      if (roads.includes(entry.id) === inFarm) return;
      if (!roads.includes(entry.id)) {
        const minX = ownerSlot * 140 - 6;
        const maxX = ownerSlot * 140 + 105.5;
        if (entry.x < minX || entry.x > maxX || entry.z < -72.5 || entry.z > 27.5) return;
      }
      this._broadcast({ type: "build", email: attachment.email, entry: { id: entry.id, x: entry.x, z: entry.z } }, socket);
    }
  }

  webSocketClose(socket, code, reason, wasClean) {
    const attachment = socket.deserializeAttachment() || {};
    this._broadcast({ type: "leave", email: attachment.email || "" }, socket);
  }

  webSocketError(socket) {
    try { socket.close(1011, "room error"); } catch (err) { /* already closed */ }
  }

  _broadcast(message, except) {
    const encoded = JSON.stringify(message);
    const sockets = this.ctx.getWebSockets();
    for (let i = 0; i < sockets.length; i++) {
      if (sockets[i] === except) continue;
      try { sockets[i].send(encoded); } catch (err) { /* socket may be closing */ }
    }
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

    if (url.pathname === "/api/world" || url.pathname === "/api/world/place") {
      const session = await readSession(request, env);
      if (!session) return json({ ok: false, error: "unauthorized" }, 401);
      if (url.pathname === "/api/world" && request.method !== "GET") {
        return json({ ok: false, error: "method not allowed" }, 405);
      }
      if (url.pathname === "/api/world/place" && request.method !== "POST") {
        return json({ ok: false, error: "method not allowed" }, 405);
      }
      const world = env.SHARED_WORLD.get(env.SHARED_WORLD.idFromName("shared-world"));
      const target = "https://shared-world/" + (request.method === "GET" ? "read" : "place");
      return world.fetch(new Request(target, request));
    }

    if (url.pathname === "/api/gift") {
      if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
      const session = await readSession(request, env);
      if (!session) return json({ ok: false, error: "unauthorized" }, 401);
      let body;
      try { body = await readJsonBody(request); }
      catch (err) { return json({ ok: false, error: "bad request" }, 400); }
      if (!isPlainObject(body)) return json({ ok: false, error: "bad request" }, 400);
      const to = normalizeEmail(body.to);
      if (!to || to === session.email || !GIFT_ITEMS[body.itemId] || !Number.isInteger(body.qty) || body.qty < 1 || body.qty > 20) {
        return json({ ok: false, error: "invalid gift" }, 400);
      }
      // Only gift to accounts present in the recent farmer roster.
      let listed = false;
      try {
        const listRes = await env.FARMERS.get(env.FARMERS.idFromName("farmers")).fetch("https://farmers/list");
        const list = await listRes.json();
        const farmers = list && Array.isArray(list.farmers) ? list.farmers : [];
        for (let i = 0; i < farmers.length; i++) {
          if (normalizeEmail(farmers[i].email) === to) { listed = true; break; }
        }
      } catch (err) { listed = false; }
      if (!listed) return json({ ok: false, error: "farmer not found" }, 404);

      const requestId = crypto.randomUUID();
      const sender = env.SAVES.get(env.SAVES.idFromName(session.email));
      const receiver = env.SAVES.get(env.SAVES.idFromName(to));
      const debitResponse = await sender.fetch("https://saves/gift-debit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: requestId, from: session.email, to: to, itemId: body.itemId, qty: body.qty })
      });
      const debit = await debitResponse.json();
      if (!debitResponse.ok || !debit.ok) return json({ ok: false, error: debit.error || "gift could not be paid" }, debitResponse.status || 409);

      let creditResponse = null;
      let credit = null;
      try {
        creditResponse = await receiver.fetch("https://saves/gift-credit", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId: requestId, from: session.email, itemId: body.itemId, qty: body.qty })
        });
        credit = await creditResponse.json();
      } catch (err) { credit = { ok: false, error: "gift delivery failed" }; }
      if (!creditResponse || !creditResponse.ok || !credit || !credit.ok) {
        try {
          await sender.fetch("https://saves/gift-refund", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: requestId })
          });
        } catch (err) { /* the debit record remains recoverable for inspection */ }
        return json({ ok: false, error: credit && credit.error ? credit.error + "; payment refunded" : "gift delivery failed" }, creditResponse ? creditResponse.status || 409 : 502);
      }
      await sender.fetch("https://saves/gift-complete", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: requestId })
      });
      try {
        const room = env.REALTIME.get(env.REALTIME.idFromName("map-room"));
        await room.fetch("https://realtime/broadcast", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "gift", from: session.email, to: to, itemId: body.itemId, qty: body.qty, requestId: requestId })
        });
      } catch (err) { /* offline delivery is already in the recipient save */ }
      return json({ ok: true, requestId: requestId, total: GIFT_ITEMS[body.itemId].price * body.qty });
    }

    if (url.pathname === "/api/realtime") {
      if (request.headers.get("upgrade") !== "websocket") return json({ ok: false, error: "websocket upgrade required" }, 426);
      const session = await readSession(request, env);
      if (!session) return json({ ok: false, error: "unauthorized" }, 401);
      const room = env.REALTIME.get(env.REALTIME.idFromName("map-room"));
      const target = "https://realtime/connect?email=" + encodeURIComponent(session.email);
      return room.fetch(new Request(target, request));
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
