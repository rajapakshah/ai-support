# Deployment checklist

## Brand and content

- Replace `Nexora ERP`, the placeholder logo, example leadership profiles, and representative customer results.
- Replace all `nexora.example` URLs and email addresses.
- Confirm whether positioning is IFS-only, IFS-led, or multi-ERP.
- Approve service, industry, customer story, legal, privacy, and accessibility copy.
- Add approved client logos, photography, partner marks, and social profiles.

## Cloudflare

- Install dependencies with `npm install`.
- Update the Worker name and compatibility date in `wrangler.jsonc` if required.
- Configure the production custom domain.
- Add `TURNSTILE_SECRET_KEY`, `LEAD_WEBHOOK_URL`, and optional `LEAD_WEBHOOK_TOKEN` as secrets.
- Add the matching Turnstile widget site key and widget markup to `public/contact/index.html`.
- Confirm Worker logs and alert ownership.

## Quality assurance

- Run `npm run check`.
- Review every page at 390, 768, 1024, and 1440 CSS pixels.
- Test keyboard navigation, focus order, 200% zoom, reduced motion, and a screen reader.
- Test the contact form against the production webhook, including invalid, automated, and failed-delivery states.
- Run Lighthouse and confirm the Core Web Vitals targets in the PRD.
- Validate metadata, sitemap, robots directives, canonical URLs, structured data, and the 404 response.
- Verify the Content Security Policy after adding analytics, Turnstile, media, or other third-party services.

## Launch

- Deploy a preview and obtain stakeholder approval.
- Confirm the production domain, TLS, security headers, and redirects.
- Submit the sitemap to the selected search tools.
- Confirm analytics and conversion events without personal form data.
- Document the rollback and content publishing process.
