# Cloudflare Workers — DePara

This setup is staged on branch `cloudflare-worker-setup`, not deployed.

- `preview/wrangler.toml`: `depara-api-preview` with D1 `depara-preview-db`.
- `production/wrangler.toml`: `depara-api` with D1 `depara-db`.
- Both Workers require existing secret `TELEGRAM_BOT_TOKEN`, stored **only** in Cloudflare, never committed.
- Worker source `worker.js` is **not** committed yet. The copied Markdown exports must be reconciled with the live deployed code before any deployment.
- No Git integration, workflow, or auto-deploy is enabled by these files.
- Do not connect either Worker to the repo or run `wrangler deploy` until source parity, secret retention, routes, D1 bindings and rollback have been checked.
- Production deployment requires explicit user approval after preview tests.

Note: existing production code snapshot appears to have unreachable Messenger 2.0 routes; do not silently change behavior as part of a backup.
