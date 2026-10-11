# Worker authentication setup

The Worker expects two secrets. They are intentionally not stored in `wrangler.jsonc`, `.env.example`, or browser storage:

- `AUTH_CODE`: the shared password entered on the login screen (the secret's existing name is unchanged).
- `SESSION_SECRET`: a random signing secret of at least 32 characters. Keep it private and do not reuse the Cloudflare API token.

For local development, copy `.dev.vars.example` to `.dev.vars` and set both values. `.dev.vars` is ignored by Git.

For the deployed Worker, set the secrets from this project directory with Wrangler. Each `secret put` publishes a Worker version, so set both before deploying the updated source:

```sh
npx wrangler secret put AUTH_CODE
npx wrangler secret put SESSION_SECRET
```

Wrangler prompts for each value. `AUTH_CODE` should match the code players already use. Generate a separate random `SESSION_SECRET`; changing it invalidates existing remembered sessions. Deploy the updated Worker only after both secrets are configured. The login code is checked by the Worker, while saves use a signed, HttpOnly, Secure session cookie. The “Stay logged in” option controls whether that cookie lasts for up to 30 days.

To generate a signing secret, run `openssl rand -hex 32` in a private terminal and enter its output at Wrangler's `SESSION_SECRET` prompt. Do not put either Worker secret in `.env`, the browser bundle, or command-line arguments.

## Name-based login

Players now enter **Name** and **Password**, not an email address. `/api/login`
accepts `{ name, password, remember }`; remembered sessions send `{ name,
remember }` and must have a valid signed cookie. Names are trimmed, repeated
spaces are collapsed, and the save identity is case-insensitive. Names support
letters (including accented letters), numbers, spaces, dots, underscores,
apostrophes, and hyphens, up to 64 characters. Two players choosing the same
normalized name share the same farm; choose distinct farmer names.

The existing shared `AUTH_CODE` behavior is retained; this is not individual
account registration or a per-player password system. Passwords are checked
server-side and are never persisted in browser storage. Explicit authentication
and validation failures cannot fall through to offline play. Offline fallback
for an unreachable server remains a local-only game, not an authenticated
server session.

The internal `email` fields in saves, cookies, farmer lists, gifts, and realtime
messages remain compatibility aliases for the canonical identity. They no
longer require an email-shaped value. New save requests send `{ name, state }`;
the Worker still accepts the old `{ email, code }` login and `{ email, state }`
save shapes for older clients.

The original name-login rollout preserved email-keyed farms and migrated
remembered email hints without re-keying saved data. That compatibility was
superseded by the explicitly authorized reset below: old farms are now deleted,
and entering an old email creates a fresh farm rather than restoring progress.

## Explicit reset — October 11, 2026

At the owner's request, migration `v5-name-farm-reset` permanently deletes the
old `GameSaves` and `FarmerList` namespaces and creates empty `NameGameSaves`
and `NameFarmerList` namespaces. This is a delete/create operation, **not** a
rename or data transfer. Earlier saved farms and registered farmer records
are no longer retained. Shared roads/world data are unchanged.

Session cookies now carry the `names-2026-10-11` generation; pre-reset cookies
are rejected even if their signature is valid. On first load of this release,
the browser clears old game-local save caches and identity hints. New local
saves use a generation-specific prefix. Graphics/accessibility preferences
and the shared-road queue are retained. Subsequent deployments do not repeat
the reset. Keep the generation constant unless another reset is authorized.
