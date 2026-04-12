# Contributing

Thanks for helping improve **agentskeptic**.

## Before you start

- Read **[README.md](README.md)** for the product model and quickest demo (`npm start`).
- Normative behavior and CLI contracts live in **[docs/agentskeptic.md](docs/agentskeptic.md)**; product and correctness boundaries in **[docs/verification-product-ssot.md](docs/verification-product-ssot.md)** and **[docs/correctness-definition-normative.md](docs/correctness-definition-normative.md)**.

## Development setup

- **Node.js ≥ 22.13** (see `package.json` `engines`).
- `npm install`
- `npm run build` — TypeScript compile and asset copy.
- `npm test` — default validation before a PR (OSS `npm run build` + Vitest + SQLite `node:test`, then `scripts/commercial-enforce-test-harness.mjs` rebuilds **commercial** `dist/` and runs **`enforce`** integration tests plus **`assurance` CLI regression tests`, then `npm run build` restores OSS `dist/`, then `npm run validate-ttfv`). Policy: **[`docs/commercial-enforce-gate-normative.md`](docs/commercial-enforce-gate-normative.md)**.

## Pull requests

- **Public URLs or product one-liner:** edit [`config/public-product-anchors.json`](config/public-product-anchors.json), then from **repo root** run **`npm run sync:public-product-anchors`** and commit the derived artifacts (`schemas/openapi-commercial-v1.yaml`, root `package.json` fields, README marker regions). This matches [`docs/public-distribution-ssot.md`](docs/public-distribution-ssot.md). If you touch distribution surfaces or anchors, run **`npm run validate-commercial`** (requires Postgres `DATABASE_URL`) before opening a PR. If you change **`prepublishOnly`**, **`scripts/pack-smoke-commercial.mjs`**, or commercial codegen, also run **`npm run pack-smoke`** (or rely on **`validate-commercial`**, which includes it).
- **Acquisition / visitor framing (README H1, homepage hero `homepageHero` why/what/when plus `heroSubtitle`, CTA, `/database-truth-vs-traces`, `llms.txt` including demand moments, CLI footer lines):** edit [`config/discovery-acquisition.json`](config/discovery-acquisition.json) only (must satisfy [`config/discovery-acquisition.schema.json`](config/discovery-acquisition.schema.json)), then **`npm run sync:public-product-anchors`** and commit the updated **README** regions inside `<!-- discovery-readme-title:start/end -->` and `<!-- discovery-acquisition-fold:start/end -->`, root **`llms.txt`**, and **`src/publicDistribution.generated.ts`**. **`website/public/llms.txt`** is gitignored; it is regenerated locally and on **`website` prebuild**—do not commit it. Do not edit prose inside those README markers by hand.
- Keep changes focused; match existing style and patterns in touched files.
- If you change user-visible CLI behavior, stdout/stderr, or schemas, update the relevant **docs** and **tests** (many behaviors are guarded by doc-contract and golden tests).
- Do not duplicate normative numbers or stream contracts in the README when they belong in `docs/quick-verify-normative.md` or `docs/agentskeptic.md`.

## Reporting issues

- Describe expected vs actual behavior, minimal reproduction, and Node version.
- For security-sensitive reports, use **[SECURITY.md](SECURITY.md)** instead of a public issue.
