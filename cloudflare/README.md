# Cloudflare Workers — DePara (staging only)

## Environments

| | Preview | Production |
|---|---|---|
| Worker | `depara-api-preview` | `depara-api` |
| D1 binding | `DB` | `DB` |
| D1 name | `depara-preview-db` | `depara-db` |
| D1 ID | `c1602af7-3219-4d14-87af-8515c40193be` | `6beccbd7-053f-491b-8d8a-77f2179c1041` |

`preview/wrangler.toml` and `production/wrangler.toml` are staged for review. Neither deploys anything by itself.

## Deployment blockers

1. Review the uploaded source snapshots `preview/worker.snapshot.js` and `production/worker.snapshot.js` against the live deployed Workers. These snapshots were reconstructed from Markdown copies and **must not be deployed as-is**. After parity review, create validated `worker.js` files for each environment.
2. The available preview copy is a **bundled output** (`worker_default as default`, `sourceMappingURL`); validate parity with the actual deployed version, not merely JS syntax.
3. Confirm all existing routes, especially social and Messenger 2.0 paths, and preserve existing functionality.
4. Verify the existing `TELEGRAM_BOT_TOKEN` secret remains bound to the correct bot in each environment. Never put bot tokens into Git.
5. Verify D1 schema compatibility and safe rollback. Test all API routes and Telegram flows on preview.
6. Configure deployment only after review. GitHub repository authorization alone does **not** enable Cloudflare deployments.
7. **Do not enable automatic production deployment** without the owner's explicit approval.

## Manual commands (do not execute yet)

From the repository root, once the source is verified:

```bash
cd cloudflare/preview
npx wrangler deploy
```

Production uses `cd cloudflare/production` and requires separate explicit approval.

## Status

- GitHub configuration staged on `cloudflare-worker-setup`.
- Source snapshots imported into this branch for audit; runnable `worker.js` not yet staged.
- No Cloudflare Git integration enabled.
- No Workers deployed or modified.
