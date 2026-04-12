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

### Marketing copy and discovery sync

- **Discovery:** edit **`config/discovery-acquisition.json`** (must validate against **`config/discovery-acquisition.schema.json`**).
- **Site-only copy:** edit **`website/src/content/productCopy.ts`** for strings that should not live in discovery JSON (for example commercial terms list items or account licensed steps).
- **Sync:** after changing discovery titles, visitor answer, CLI footer lines, or anchor-derived fields, run **`npm run sync:public-product-anchors`** from repo root and commit the regenerated README marker regions, root **`llms.txt`**, and **`src/publicDistribution.generated.ts`** as emitted by the script.
- **Gate:** before merging marketing or discovery changes, run **`npm run verify:web-marketing-copy`** so schema validation, visitor-outcome node tests, the website build, and the full website Vitest suite (including **`docs-marketing-contract`**) all pass.

## GitHub Actions (operator)

This section is the **normative** single source of truth for CI and release workflows. Workflow YAML header comments are pointers only; behavioral rules must not live only in workflow comments.

### Default token permissions

- **[`.github/workflows/ci.yml`](.github/workflows/ci.yml)** and **[`.github/workflows/assurance-scheduled.yml`](.github/workflows/assurance-scheduled.yml)** declare workflow-level `permissions: contents: read` so the default `GITHUB_TOKEN` scope does not depend on repository or organization defaults.
- **Commercial npm publish** ([`.github/workflows/commercial-publish.yml`](.github/workflows/commercial-publish.yml)) uses `permissions: contents: read` and `id-token: write` for npm **Trusted Publishing (OIDC)**. The workflow must not use `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or `registry-url` on `setup-node` for publish auth; publish targets `https://registry.npmjs.org` via the `npm publish` `--registry` flag only.

### CI concurrency (normative)

| Trigger | Concurrency group | `cancel-in-progress` | Expected outcome |
|---------|-------------------|----------------------|------------------|
| `push` / `pull_request` to **`refs/heads/main`** | `ci-${{ github.workflow }}-${{ github.ref }}` | **false** | Two rapid `main` pushes may yield **two concurrent** workflow runs; both may run to completion; neither is canceled by a sibling `main` run. Branch protection treats the conclusion of the run(s) the protection rule evaluates as authoritative (standard GitHub behavior). |
| `push` / `pull_request` to **any other ref** | same group formula | **true** | A newer push on the **same ref** **cancels** the older in-progress run. The canceled run ends **`cancelled`**. Required checks re-target the **newest** run for that PR or branch; superseded runs must not be interpreted as the final gate. |
| **`distribution-consumer`** job | Same workflow run as `test` / `commercial` | N/A | If the **parent** workflow run is canceled before `distribution-consumer` starts, that job does not run for that run id. The **replacement** run re-executes `needs: [test, commercial]` from scratch. |

### Distribution consumer token

- On `main` only, when `DISTRIBUTION_GITHUB_TOKEN` is set, **CI** runs **`scripts/distribution-consumer-pipeline.mjs`** with that secret plus the default `GITHUB_TOKEN` as documented in the workflow. This is unchanged by the least-privilege and concurrency policies above.

### Failure modes (summary)

| Failure | System behavior |
|---------|------------------|
| Trusted Publisher / OIDC misconfiguration | `npm publish` fails; there is no token fallback in the workflow. |
| Registry lag after publish | The verify step retries then fails the job if the version never appears. |
| Concurrency cancel on a feature branch | Superseded run is `cancelled`; the latest run owns the gate. |

### Release-validation procedure (single path; all on `main`; no alternate branches)

These steps are required for a commercial release that ships the workflow and version together:

1. **Prepare one PR** into `main` that contains: (a) all workflow edits, (b) CONTRIBUTING edits under this section as needed, (c) **the next semver bump** in [`package.json`](package.json) and matching root entries in [`package-lock.json`](package-lock.json) (patch bump over current `latest` on npm—for example if npm `latest` is `0.1.3`, set `0.1.4`). One PR avoids an extra merge cycle.
2. **Open the PR and wait for `CI` green** (`test` + `commercial`; `distribution-consumer` runs only when the workflow’s existing conditions are met, including `refs/heads/main` and a configured token—on a PR branch the consumer job may still skip; that is unchanged).
3. **Merge the PR to `main`** using the repository’s normal merge policy (squash or merge commit). Record the merge SHA if you need an audit trail.
4. **On `main` after merge**, a maintainer runs **Actions → Commercial npm publish → Run workflow** with the production `commercial_license_api_base_url` input. Do not reconfigure Trusted Publisher or mutate repository secrets as a validation technique.
5. **On `main` after merge**, a maintainer runs **Actions → Assurance scheduled → Run workflow**.
6. **Collect validation evidence**: URLs or log excerpts for the Commercial npm publish run (publish and verify steps) and the Assurance run; run `npm view agentskeptic version` to confirm registry `latest` equals the bumped version.

**Repo clean state after validation:** `main` contains merged workflow, this documentation, and the **released** semver. Do not revert the version bump after a successful publish; the bumped version is the released version.

**Required checks after merge (non-`main` concurrency):** From `main`, create a **throwaway branch**, push two trivial commits in quick succession on that branch, and confirm the older `CI` run is **`cancelled`** and the newer run **`success`**—proving cancel-in-progress for non-`main` without changing `main`’s concurrency semantics.

## Reporting issues

- Describe expected vs actual behavior, minimal reproduction, and Node version.
- For security-sensitive reports, use **[SECURITY.md](SECURITY.md)** instead of a public issue.
