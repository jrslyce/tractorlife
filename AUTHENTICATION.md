# Worker authentication setup

The Worker expects two secrets. They are intentionally not stored in `wrangler.jsonc`, `.env.example`, or browser storage:

- `AUTH_CODE`: the shared code entered on the login screen.
- `SESSION_SECRET`: a random signing secret of at least 32 characters. Keep it private and do not reuse the Cloudflare API token.

For local development, copy `.dev.vars.example` to `.dev.vars` and set both values. `.dev.vars` is ignored by Git.

For the deployed Worker, set the secrets from this project directory with Wrangler. Each `secret put` publishes a Worker version, so set both before deploying the updated source:

```sh
npx wrangler secret put AUTH_CODE
npx wrangler secret put SESSION_SECRET
```

Wrangler prompts for each value. `AUTH_CODE` should match the code players already use. Generate a separate random `SESSION_SECRET`; changing it invalidates existing remembered sessions. Deploy the updated Worker only after both secrets are configured. The login code is checked by the Worker, while saves use a signed, HttpOnly, Secure session cookie. The “Stay logged in” option controls whether that cookie lasts for up to 30 days.

To generate a signing secret, run `openssl rand -hex 32` in a private terminal and enter its output at Wrangler's `SESSION_SECRET` prompt. Do not put either Worker secret in `.env`, the browser bundle, or command-line arguments.
