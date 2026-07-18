# SCAN Electrolyte Design Platform

A browser-native research interface for the SCAN non-aqueous electrolyte project.

## Included capabilities

- Search the published 11,515,140-formulation conductivity atlas with salt, concentration, unit, solvent, ratio, and temperature controls.
- Run the trained dynamic-routing conductivity model locally in the browser with ONNX Runtime Web.
- Interactively rotate and inspect the published salt and solvent structures with 3Dmol.js.
- Read the scientific context, developers, citation, and planned advanced modules.
- Record page views, searches, predictions, and server-derived countries through a private Cloudflare Durable Object. The public site has no counter-setting endpoint or analytics secret.

The scientific source, training code, and original data are maintained in [CodingWZL/SCAN](https://github.com/CodingWZL/SCAN).

## Development

```bash
pnpm install
pnpm dev
pnpm build
```

Pushes to `main` deploy automatically through GitHub Pages.

## Private analytics deployment

The website deliberately does not use CounterAPI, browser geolocation, public
counter floors, or `localStorage` as an analytics authority. Counts are
deduplicated and updated transactionally in a Cloudflare Durable Object.

Add these two GitHub Actions secrets once:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` with Workers Scripts edit permission

Register the account's `workers.dev` subdomain once, then add the deployed
Worker URL as the `ANALYTICS_ENDPOINT` repository variable. Run **Deploy private
analytics** from GitHub Actions. The workflow deploys the Worker, generates a
private rate-limit salt, verifies the service, and redeploys GitHub Pages. The
repository variable is intentionally administrator-managed because the default
workflow token cannot create or update Actions variables.

The service intentionally has no public admin, set, reset, or correction route.
Country comes from Cloudflare's request metadata. Raw IP addresses are never
stored; only short-lived salted hashes are used to constrain abusive traffic.
