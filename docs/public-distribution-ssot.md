# Public distribution SSOT

Single place for **public identity**, **anchor sync**, **CI / Vitest public origin**, and **OpenAPI discoverability** (valid OpenAPI 3.0.3 with explicit pointers to GitHub, npm, the canonical site, `/integrate`, and the spec URL).

## Engineer

### Ownership: discovery JSON vs productCopy.ts

| Source | Role |
|--------|------|
| **`config/discovery-acquisition.json`** | Acquisition fold, visitor answer, hero titles, CTA label, and machine-readable appendix inputs consumed by sync and the Next.js app. |
| **`website/src/content/productCopy.ts`** | Site-only strings (pricing commercial terms bullets, account licensed steps, shell-only lines) that are not duplicated in discovery JSON. |
| **`llms.txt`** | Committed root agent surface (byte-synced with the site after **`npm run sync:public-product-anchors`**). |

### Artifact ownership

| Path | Role | Hand edit? |
|------|------|------------|
| `config/public-product-anchors.json` | Authoritative: `identityOneLiner`, `productionCanonicalOrigin`, **`distributionConsumerRepository`** (owner/name), git/npm/bugs URLs, `keywords` | Yes |
| `docs/distribution-product-requirement.md` | REQ-DIST stakeholder requirement prose | Yes |
| `scripts/distribution-consumer-pipeline.mjs` | Cross-repo consumer lifecycle + P6.5 + P7 + P8 proof | No (logic) |
| `src/publicDistribution.generated.ts` | CLI stderr **`formatDistributionFooter()`** (multi-line funnel + SSOT; from sync) | No |
| `src/distributionFooter.ts` | Re-export footer for CLI | Yes (thin) |
| `AGENTS.md` | Agent pointer to SSOT | No (sync-written) |
| `test/distribution-*.test.mjs` | Clause, traceability, pipeline unit tests | No |
| `test/registry-metadata-parity.test.mjs` | Committed **`package.json` `description`** equals **`pageMetadata.description`** and not **`identityOneLiner`** | No |
| `config/discovery-acquisition.json` | Acquisition copy: `readmeTitle`, `homepageHero` (why/what/when; on `/database-truth-vs-traces` acquisition narrative and README fold—not in homepage `<main>`), homepage `<main>` hero uses `heroTitle`, `homepageDecisionFraming`, `heroSubtitle` in that order, `demandMoments`, `cliFollowupLines`, visitor problem answer, **`indexableGuides`** (paths, hub labels, `problemAnchor` strings; drives **`## Indexable guides`** in `llms.txt`, sitemap guide URLs, `/guides` hub links), **`indexableExamples`** (paths for `/examples/*`; drives **`## Indexable examples`** in `llms.txt` and sitemap example URLs), **`shareableTerminalDemo`** (`title` + `transcript` for README fold fenced block, `/database-truth-vs-traces` `<pre>`, and `llms.txt` pasteable section—verbatim bundled demo contrast only; **not** on homepage `/`), **`pageMetadata.description`** (npm `description`, site-wide HTML meta, Open Graph/Twitter, `SoftwareApplication` JSON-LD `description`), homepage CTA label, `llms` appendix arrays, README fold template; consumed by sync and the website | Yes |
| `config/discovery-acquisition.schema.json` | JSON Schema (draft-07): product-law patterns on `visitorProblemAnswer` and on **`pageMetadata.description`** (length + patterns), required fields | Yes |
| `scripts/discovery-acquisition.lib.cjs` | Validate discovery JSON, build README fold body (including appended acquisition markdown link); `llms` appendix sections consumed via [`discovery-payload.lib.cjs`](../scripts/discovery-payload.lib.cjs) | No (logic) |
| `scripts/discovery-payload.lib.cjs` | Single `DiscoveryPayload` v1 builder + `llms.txt` / CI Markdown renders + PR upsert selector | No (logic) |
| `scripts/write-discovery-payload.mjs` | Writes `dist/discovery-payload-v1.json` during build | No |
| `scripts/render-discovery-ci.mjs` | Consumer CI CLI: `summary` / `pr_body` from frozen payload | No |
| `dist/discovery-payload-v1.json` | Frozen payload shipped in npm tarball (gitignored until build) | No |
| `llms.txt` (repo root) | Committed agent surface; byte-synced with `website/public/llms.txt` after sync | No |
| `docs/ambient-ci-distribution.md` | Ambient GitHub Actions contract (sizes, upsert, permissions) | Yes |
| `scripts/validate-discovery-acquisition.mjs` | CLI: run validation only (`npm run check:discovery-acquisition`) | No |
| `schemas/openapi-commercial-v1.in.yaml` | OpenAPI source with sync tokens only (no hardcoded distribution URLs); includes **`POST /api/public/verification-reports`** (`createPublicVerificationReport`) | Yes |
| `schemas/openapi-commercial-v1.yaml` | Derived from sync | No |
| `schemas/public-verification-report-v1.schema.json` | Public share POST envelope (`workflow` \| `quick`) | Yes |
| `docs/shareable-verification-reports.md` | SSOT for `/r/{id}`, POST body cap (**393216** bytes), **`PUBLIC_VERIFICATION_REPORTS_ENABLED`**, CLI **`--share-report-origin`** | Yes |
| `docs/discovery-guides.md` | SSOT for **indexable** `/guides/*` (from **`indexableGuides`**), hub **`/guides`** (noindex), sitemap/`llms.txt` policy, redaction reference, GitHub templates | Yes |
| `docs/discovery-surfaces.md` | Indexable vs private discovery IA: `/guides/*`, `/examples/*`, `/r/*`, sync commands | Yes |
| `website/public/openapi-commercial-v1.yaml` | Derived (gitignored); `servers[0].url` and self-URL use effective public origin | No |
| Root `package.json` | **`description`** from **`config/discovery-acquisition.json` → `pageMetadata.description`**; **`repository`**, **`homepage`**, **`bugs`**, **`keywords`** from anchors via sync | No (those fields) |
| `README.md` | Regions between `<!-- discovery-readme-title:start/end -->`, `<!-- discovery-acquisition-fold:start/end -->`, and `<!-- public-product-anchors:start/end -->` | No inside markers (all are sync-written) |

### Maintainer sync (normative)

From **repository root** only:

- After editing anchors, **`config/discovery-acquisition.json`**, or other hand-editable surfaces: **`npm run sync:public-product-anchors`**
- Validate only: **`npm run check:public-product-anchors`** (runs OpenAPI token check + discovery schema validation).
- Discovery-only validate: **`npm run check:discovery-acquisition`**
- Registry metadata parity (committed **`package.json` `description`** vs **`pageMetadata.description`**): **`node --test test/registry-metadata-parity.test.mjs`** (included in **`npm run test:node:sqlite`** and **`npm run validate-commercial`** after migrate).

Do **not** document `node scripts/public-product-anchors.cjs` as the primary workflow; the npm scripts above are the prescribed entrypoints.

The website **`prebuild`** must be exactly:

`npm --prefix .. run sync:public-product-anchors && node ../scripts/sync-integrator-docs-embedded.mjs`

**`--prefix` is a global npm option** and must appear **immediately after `npm`**, before `run` — not after the script name.

### Website tests that touch OpenAPI / `npm pack`

`website/package.json` `devDependencies` for these tests are fixed to **`tar@7.5.13`** and **`yaml@2.8.3`** (exact versions). Use `import tar from 'tar'` / `await tar.x(…)` and `import { parse } from 'yaml'` — see `website/__tests__/distribution-graph.test.ts` and `openapi-commercial.contract.test.ts`.

## Integrator

- **`productionCanonicalOrigin`** in `config/public-product-anchors.json` is the canonical browser origin (normalized to `URL.origin`).
- **Committed** repo OpenAPI (`schemas/openapi-commercial-v1.yaml`) uses that origin for `servers` and distribution URLs where specified by the sync algorithm.
- **Served** copy under `website/public/` uses `NEXT_PUBLIC_APP_URL` when set (non-whitespace) for `servers` and the self OpenAPI URL; otherwise it falls back to `productionCanonicalOrigin`.
- Discoverability in the spec:
  - `info.contact.url` — canonical site origin
  - Root **`externalDocs`** (not under `info`) — first-run integration guide at `{canonical}/integrate` with **`description: "First-run integration guide"`**
  - `info.x-agentskeptic-distribution` with keys **`repository`**, **`npmPackage`**, **`openApi`**
- **Public share surfaces (literals):** **`POST {canonical}/api/public/verification-reports`**, **`GET {canonical}/r/{uuid}`** (HTML report; **`X-Robots-Tag: noindex, nofollow`**), indexable guide **`GET {canonical}/guides/verify-langgraph-workflows`**. Normative: [`shareable-verification-reports.md`](shareable-verification-reports.md).
- **Ambient CI (GitHub):** job summary + optional PR upsert for commercial verify — single contract in [`ambient-ci-distribution.md`](ambient-ci-distribution.md); payload + renders live in [`scripts/discovery-payload.lib.cjs`](../scripts/discovery-payload.lib.cjs).

API semantics remain in **`docs/commercial-ssot.md`**.

## Operator

### CI (`jobs.commercial.env`)

Exactly **eight** variables (names only; values match `.github/workflows/ci.yml`):

`DATABASE_URL`, `AUTH_SECRET`, `CONTACT_SALES_EMAIL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_INDIVIDUAL`, `STRIPE_PRICE_TEAM`, `STRIPE_PRICE_BUSINESS`

**`NEXT_PUBLIC_APP_URL`** and **`VERCEL_ENV`** are **not** set in YAML. `scripts/validate-commercial-funnel.mjs` sets them from `config/public-product-anchors.json` (`normalize(productionCanonicalOrigin)` and `VERCEL_ENV=production`) for `drizzle-kit migrate` and website Vitest.

Production deploys (e.g. Vercel) must set **`NEXT_PUBLIC_APP_URL`** to the same origin as **`productionCanonicalOrigin`** in JSON.

### Origin parity (Next config)

Loaded from `website/next.config.ts` via `assertNextPublicOriginParity()`:

```js
const skip =
  process.env.NODE_ENV !== "production" ||
  process.env.VERCEL_ENV === "preview";
if (!skip && normalize(process.env.NEXT_PUBLIC_APP_URL) !== normalize(canonicalFromJson))
  throw new Error("NEXT_PUBLIC_APP_URL must equal productionCanonicalOrigin");
```

### `distribution-graph.test.ts` and visitor outcome

**`npm run validate-commercial`** from repo root runs, in order after `drizzle-kit migrate`: **`node --test test/visitor-problem-outcome.test.mjs`** (README discovery fold strict equality + schema validation), then **`node --test test/registry-metadata-parity.test.mjs`** (committed **`package.json` `description`** matches **`pageMetadata.description`** and not **`identityOneLiner`**), then **`npx vitest run`** in `website/` (includes `website/__tests__/distribution-graph.test.ts`), then **`scripts/check-web-demo-prereqs.mjs`**, then **`scripts/pack-smoke-commercial.mjs`**, then **`npm run build`** (restore OSS **`dist/`**). Requires Postgres **`DATABASE_URL`**, injected public origin, and full harness. Running bare `cd website && npx vitest` without that harness is **unsupported** for `distribution-graph.test.ts`.

---

## Distribution consumer pipeline (normative)

**Requirement prose SSOT:** [`distribution-product-requirement.md`](distribution-product-requirement.md) (`### REQ-DIST-*` headings). **Clause heading set** must equal the **Clause ID** set in the traceability table below (enforced by `test/distribution-requirement-clauses.test.mjs` + `test/distribution-ssot-clause-coverage.test.mjs`).

**Implementation entrypoint:** [`scripts/distribution-consumer-pipeline.mjs`](../scripts/distribution-consumer-pipeline.mjs) (repo root). **Consumer repository** full name (e.g. `owner/name`) is **`distributionConsumerRepository`** in [`config/public-product-anchors.json`](../config/public-product-anchors.json).

**GitHub CLI:** all remote operations use **`gh`** with JSON where specified. **`GITHUB_TOKEN`** (or **`DISTRIBUTION_GITHUB_TOKEN`** when set) must allow **`repo`** workflow scope on the consumer and read access to the primary repo as needed.

### Stable proof vocabulary (literal binding)

For **`REQ-DIST-004`** and **`REQ-DIST-005`** traceability rows, the **Implementation** cell must contain these **four** case-sensitive substrings anywhere in the cell: **`run-name`**, **`distribution-proof`**, **`proof.json`**, **`foreign_smoke_fixture_sha256`**. They are the minimum stable identifiers tying list API / YAML **`run-name`**, artifact **`name`** / directory **`distribution-proof`**, the proof file **`proof.json`**, and the JSON field **`foreign_smoke_fixture_sha256`**. Renames require a coordinated plan revision and test updates.

### Traceability (Clause ID set equals requirement headings)

<!-- distribution-traceability-table:start -->
<!-- distribution-traceability-literals:start -->

| Clause ID | Requirement summary | Implementation | Evidence |
|-----------|--------------------|----------------|----------|
| REQ-DIST-001 | Consumer repo exists, `main` default, Actions on | **P1–P4** in [`scripts/distribution-consumer-pipeline.mjs`](../scripts/distribution-consumer-pipeline.mjs): `gh api repos/{consumer}`; default branch; `actions/permissions` | CI job **`distribution-consumer`** |
| REQ-DIST-002 | Published `foreign-smoke.yml` bytes match verified fixture | **P5–P6**: `gh api` Contents `PUT` / `GET`; drift `WORKFLOW_DRIFT_AFTER_PUT` | Same |
| REQ-DIST-003 | Indexed workflow + Actions post-publish | **P6.5(c)(d)**: `gh workflow view foreign-smoke.yml` retry **5s / 120s**; second permissions `GET` | Same |
| REQ-DIST-004 | Proof without `gh run view` inputs: list by **`run-name`**, artifact **`distribution-proof`**, file **`proof.json`**, field **`foreign_smoke_fixture_sha256`** | **P8** in script + generated consumer YAML: `run-name`, `distribution-proof`, `proof.json`, `foreign_smoke_fixture_sha256` | `test/distribution-consumer-pipeline.test.mjs` |
| REQ-DIST-005 | Merge gate runs distribution last | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) job **`distribution-consumer`** with **`needs: [test, commercial]`**; `if` canonical repo + `main`; **P7** dispatch + **P8** proof; consumer list key **`run-name`**; artifact **`distribution-proof`**; **`proof.json`**; JSON **`foreign_smoke_fixture_sha256`** | Green **`distribution-consumer`** on `main` |
| REQ-DIST-006 | Docs link SSOT | This file + [`agentskeptic.md`](agentskeptic.md) pointer | Doc tests |

<!-- distribution-traceability-literals:end -->
<!-- distribution-traceability-table:end -->

### Strip-hash env line (`FOREIGN_SMOKE_FIXTURE_SHA256`)

**Normative:** Define **`stripForeignSmokeBodyForHash(yamlUtf8)`** as UTF-8 of the workflow text **after** removing the injected job-level block consisting of **`env:`** on one line and the following line whose trimmed content starts with **`FOREIGN_SMOKE_FIXTURE_SHA256:`** (regex removal plus a safety line-filter for that prefix). **`FIXTURE_SHA256`** is **`sha256(stripForeignSmokeBodyForHash(fullYaml))`**. The generator builds YAML **without** that block, computes **`FIXTURE_SHA256`**, then inserts the block between **`runs-on`** and **`steps`**:

```yaml
    env:
      FOREIGN_SMOKE_FIXTURE_SHA256: "<64 lowercase hex chars>"
```

If recompute after injection does not match the literal → **`FIXTURE_HASH_INJECTION_FAILED`** (build-time, before HTTP).

### Post-publish gate **P6.5** (single phase, ordered)

Sub-steps **(a)** ref parity `PUT` response `commit.sha` vs `refs/heads/main` (**`WORKFLOW_REF_MISMATCH`** / **`WORKFLOW_FIRST_COMMIT_BLOCKED`**). **(b)** `GET` Contents `foreign-smoke.yml`, decode base64, SHA-256 must equal **`FIXTURE_SHA256`** from the same in-memory fixture bytes as **P5/P6** → else **`PRE_DISPATCH_CONTENT_HASH_MISMATCH`**. **(c)** `gh workflow view foreign-smoke.yml` retry window **5s** interval, **120s** max → **`WORKFLOW_NOT_INDEXED`**. **(d)** `GET …/actions/permissions` → **`CONSUMER_ACTIONS_DISABLED_POST_PUBLISH`**. **(e)** Record **`T_DISPATCH_BEFORE`** (UTC ms, `Date.now()` once) and **`correlation_id`** = **`<github.repository>#<github.run_id>`** (primary workflow only).

### **P8** poll, download, proof (authoritative)

**Fixed window:** **`T_WINDOW_START_MS = T_DISPATCH_BEFORE - 5000`**, never recomputed from wall clock per poll.

1. **`gh run list`** `--workflow foreign-smoke.yml` `--event workflow_dispatch` `--json databaseId,name,createdAt,status,conclusion`.
2. **`C`:** exact **`name ===`** `distribution-consumer-<correlation_id>` and **`createdAt` ≥ `T_WINDOW_START_MS`** (ISO timestamps from API parsed to ms).
3. **`S`:** `C ∩ { conclusion === "success" }`. If **`S`** non-empty, **`R`** = sort **`S`** by **`createdAt` desc**, tie-break **`databaseId` desc** as decimal **BigInt**; take first. **No** failure for multiplicity alone.
4. Poll **15s** interval, **900s** max. When **`R`** defined → exit poll → download. **On timeout** without **`R`**: **`STALE_SUCCESS_IGNORED`** iff every poll had **`C` empty** and some in-window **`success`** existed on any poll; else **`NO_RUN_WITHIN_POLL`** (evaluate stale rule first).
5. **`gh run download <R.databaseId> -n distribution-proof -D <tmp>`**; accept only **`<tmp>/distribution-proof/proof.json`**; **`readdir`** gates per plan (**`PROOF_ARTIFACT_MISMATCH`**).
6. JSON keys exactly **`correlation_id`**, **`verifier_sha`**, **`foreign_smoke_fixture_sha256`**. Compare to dispatched values and **`FIXTURE_SHA256`** → **`CORRELATION_PROOF_MISMATCH`**, **`VERIFIER_SHA_PROOF_MISMATCH`**, **`FIXTURE_HASH_PROOF_MISMATCH`** respectively.
7. **Never** use **`gh run view --json inputs`** for acceptance.

### Consumer `foreign-smoke.yml` (generated shape)

- Top-level **`run-name:`** exactly `distribution-consumer-${{ inputs.correlation_id }}`.
- **`workflow_dispatch`** inputs **`verifier_sha`**, **`correlation_id`** (required).
- Job **`foreign-smoke`**: checkout primary repo **tag or ref matching `verifier_sha`** is optional; minimal path uses **`npm install agentskeptic`** then **`npx agentskeptic`** against **`examples/`** with **`--no-truth-report`**; proof step **`if: success()`** writes **`proof.json`**; **`actions/upload-artifact@v4`** **`name: distribution-proof`**, **`path: proof.json`**, **`if: success()`**.

### Failure codes (pipeline stderr JSON)

Structured stderr line: `{"distributionPipeline":true,"code":"<CODE>","message":"<text>"}`. Non-zero exit **1** for pipeline failures.

Includes at least: **`CONSUMER_GET_FAILED`**, **`WORKFLOW_PUT_FAILED`**, **`WORKFLOW_REF_MISMATCH`**, **`WORKFLOW_DRIFT_AFTER_PUT`**, **`PRE_DISPATCH_CONTENT_HASH_MISMATCH`**, **`WORKFLOW_NOT_INDEXED`**, **`CONSUMER_ACTIONS_DISABLED`**, **`CONSUMER_ACTIONS_DISABLED_POST_PUBLISH`**, **`CONSUMER_DEFAULT_BRANCH_NOT_MAIN`**, **`DISPATCH_NOT_ACCEPTED`**, **`NO_RUN_WITHIN_POLL`**, **`STALE_SUCCESS_IGNORED`**, **`PROOF_ARTIFACT_MISMATCH`**, **`PROOF_ARTIFACT_DOWNLOAD_FAILED`**, **`CORRELATION_PROOF_MISMATCH`**, **`VERIFIER_SHA_PROOF_MISMATCH`**, **`FIXTURE_HASH_PROOF_MISMATCH`**, **`FIXTURE_HASH_INJECTION_FAILED`**.
