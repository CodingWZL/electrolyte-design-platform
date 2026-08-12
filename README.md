# SCAN Electrolyte Design Platforms

A browser-native research portal for the SCAN liquid-electrolyte and IonNet
solid-electrolyte projects.

## Included capabilities

- Search the published 11,515,140-formulation conductivity atlas with salt, concentration, unit, solvent, ratio, and temperature controls.
- Run the trained dynamic-routing conductivity model locally in the browser with ONNX Runtime Web.
- Browse IonNet's 8,750 computational samples, 398 experimental records, and 4,582 screened Materials Project compounds.
- Query all 207,980 published IonNet double-substitution ensemble predictions with candidate-level uncertainty.
- Interactively rotate and inspect the published salt and solvent structures with 3Dmol.js.
- Convert arbitrary SMILES into validated 2D structures, canonical identifiers, MOL/SVG files, RDKit descriptors, and Morgan fingerprints.
- Search a general electrolyte-component encyclopedia and use browser-native formulation, mixture DoE, EIS, transport, Bruce–Vincent, Arrhenius/VTF, simulation-box, dataset-quality, and Pareto-analysis utilities.
- Record page views and successful tool uses through a private Cloudflare Durable Object. Country values are cumulative all-time totals; the public site has no counter-setting endpoint or analytics secret.

The scientific source, training code, and original data are maintained in [CodingWZL/SCAN](https://github.com/CodingWZL/SCAN).
IonNet's scientific source, trained models, and original datasets are maintained
in [CodingWZL/IonNet](https://github.com/CodingWZL/IonNet).

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
China, Hong Kong, Taiwan, and Macao remain separate server codes internally for
auditability but are aggregated into one cumulative China total in the public
country list.

The first private deployment includes a one-time monotonic migration of the
last recoverable CounterAPI totals and published country floors. It never
reduces newer Durable Object values, preserves unrecoverable browser-local
history as unattributed visits, and is guarded by a durable migration key so a
normal redeploy cannot apply it twice.
