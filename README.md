# PixelLift

PixelLift is a privacy-first image upscale tool built for Cloudflare. Upload a PNG, JPEG, or WebP image, choose a 2× or 4× result, compare before and after, and download without creating an account.

## Architecture

- **Workers + Static Assets** serve the responsive app and JSON API.
- **R2** stores private originals and results.
- **D1** stores job state and expiration metadata.
- **Queues** processes images asynchronously with retries and a dead-letter queue.
- **Cloudflare Images binding** provides the immediately deployable resize/optimize pipeline.
- **Turnstile** can be enabled for abuse protection.
- A **remote AI adapter** can replace the baseline pipeline without changing the UI or API.

> The default `cloudflare-images` provider performs high-quality interpolation and sharpening; it does not invent missing detail. Configure and benchmark a true super-resolution provider before marketing the product as AI enhancement.

## Setup

Requirements: Node.js 22+, a Cloudflare account, and Wrangler authentication.

```bash
npm install
npx wrangler r2 bucket create pixel-lift-images
npx wrangler d1 create pixel-lift-db
npx wrangler queues create pixel-lift-upscale
npx wrangler queues create pixel-lift-upscale-dlq
```

Copy the D1 database ID into `wrangler.jsonc`, then run:

```bash
npm run db:migrate:local
npm run dev
```

Use `npm run dev -- --remote` to exercise Cloudflare's production image pipeline. For deployment, apply `npm run db:migrate:remote`, then `npm run deploy`.

## Optional Turnstile

```bash
npx wrangler secret put TURNSTILE_SECRET
```

Add `TURNSTILE_SITE_KEY` as a normal variable in Wrangler or the dashboard. The UI loads the widget only when a site key is present.

## True AI super-resolution

Set `UPSCALE_PROVIDER` to `remote`, add `UPSCALE_API_URL`, and optionally run `npx wrangler secret put UPSCALE_API_TOKEN`. The endpoint contract is a multipart `POST` with `image`, `scale`, and `format`; it must return the final image bytes with an image content type.

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/config` | Limits and optional Turnstile site key |
| `POST` | `/api/jobs` | Upload and queue an upscale job |
| `GET` | `/api/jobs/:id` | Poll job status |
| `GET` | `/api/jobs/:id/original` | Stream the private original |
| `GET` | `/api/jobs/:id/result` | Stream or download the result |
| `DELETE` | `/api/jobs/:id` | Delete the job and files immediately |
| `GET` | `/api/health` | Health response |

## Verify

```bash
npm run typecheck
npm test
```

Uploads are restricted by MIME type, file signature, and size. R2 remains private, UUIDs are unguessable, responses disable MIME sniffing, and an hourly task deletes expired records and objects.
