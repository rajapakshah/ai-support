# Nexora ERP Website

A modern, responsive ERP consultancy website designed for Cloudflare Workers with Static Assets.

## Local development

```bash
npm install
npm run dev
```

For a frontend-only preview, serve `public/` with any static file server. The contact form requires Wrangler to exercise the Worker API.

## Configure lead delivery

Set these production secrets before deployment:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put LEAD_WEBHOOK_URL
npx wrangler secret put LEAD_WEBHOOK_TOKEN
```

Add the matching Turnstile widget site key to `public/contact.html`. Without secrets, the Worker logs only non-sensitive lead metadata for local development.

## Deploy

```bash
npm run check
npm run deploy
```

Replace the placeholder domain, company details, email addresses, structured data, and legal copy before production launch.
