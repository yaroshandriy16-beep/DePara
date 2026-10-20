# Silent image sharing — preview only

This experiment avoids temporary Telegram `sendPhoto` messages (which can create iOS notifications) by serving JPEG files to Telegram over HTTPS.

## Prerequisites (Cloudflare account owner)

1. In Cloudflare Dashboard → R2 → Create bucket, create **depara-preview-share-images** in the same Cloudflare account as the preview Worker. Do **not** create or modify a production bucket.
2. Configure the bucket lifecycle rule to delete objects with prefix `shared/` after **1 day**. This is necessary because the Worker only deletes expired objects when they are requested; it does not periodically clean up all R2 objects.
3. Confirm the `SHARE_IMAGES` R2 binding in `cloudflare/preview/wrangler.toml`.
4. Run the existing **Deploy DePara API Preview** GitHub Action selecting branch `preview-r2-silent-share-20261021`. Do not trigger the production release.
5. Test from the preview Telegram Mini App: share a new weekly schedule, confirm a photo appears with the correct button, and check that the test bot does not send a temporary DM.
6. If Telegram rejects the URL-based inline photo, stop and keep the existing production sharing method. Record the Bot API error before making changes.

## Design / limitations

- The preview app encodes a JPEG and a small JPEG thumbnail for the Bot API.
- The Worker stores both in R2 and exposes them at `/api/share/image/<uuid>.jpg`.
- Each object expires at the application level after 24 hours. Bucket lifecycle cleanup is still required.
- URL-backed Telegram inline photo delivery must be verified end to end before production adoption.
- The code is an **unverified preview experiment**; merging this branch into the production Worker is not approved.
