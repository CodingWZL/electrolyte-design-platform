# SCAN Electrolyte Design Platform

A browser-native research interface for the SCAN non-aqueous electrolyte project.

## Included capabilities

- Search the published 11,515,140-formulation conductivity atlas with salt, concentration, unit, solvent, ratio, and temperature controls.
- Run the trained dynamic-routing conductivity model locally in the browser with ONNX Runtime Web.
- Interactively rotate and inspect the published salt and solvent structures with 3Dmol.js.
- Read the scientific context, developers, citation, and planned advanced modules.
- Connect a privacy-friendly analytics backend without placing secrets in the public bundle.

The scientific source, training code, and original data are maintained in [CodingWZL/SCAN](https://github.com/CodingWZL/SCAN).

## Development

```bash
pnpm install
pnpm dev
pnpm build
```

Pushes to `main` deploy automatically through GitHub Pages.
