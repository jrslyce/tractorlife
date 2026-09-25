// TractorLife worker: shared-code auth + per-player save state in a Durable Object.
// Static game assets are served by env.ASSETS; all /api/* routes are handled here.

const SHARED_CODE = "jadon";
const MAX_STATE_LENGTH = 524288;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "content-type": "application/json" },
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

// Case-insensitive shared secret.
function checkCode(code) {
  return String(code === undefined || code === null ? "" : code).trim().toLowerCase() === SHARED_CODE;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/login" || url.pathname === "/api/save") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "method not allowed" }, 405);
      }

      let body = {};
      try {
        body = await request.json();
      } catch (err) {
        return json({ ok: false, error: "bad request" }, 400);
      }
      if (!isPlainObject(body)) body = {};

      if (!checkCode(body.code)) {
        return json({ ok: false, error: "wrong code" }, 401);
      }

      const email = normalizeEmail(body.email);
      if (!email) {
        return json({ ok: false, error: "bad email" }, 400);
      }

      const id = env.SAVES.idFromName(email);
      const stub = env.SAVES.get(id);

      if (url.pathname === "/api/save") {
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
      const res = await stub.fetch("https://saves/load");
      const data = await res.json();
      return json({ ok: true, email: email, state: data.state });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};