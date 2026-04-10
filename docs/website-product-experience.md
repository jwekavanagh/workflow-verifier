# Website product experience (SSOT index)

This document explains how the commercial Next.js site works and points to **normative code** for contracts and copy. Do not duplicate guarantee tables or wire schemas here—edit the referenced files.

## Engineer

- **Demo runner:** [`website/src/lib/demoVerify.ts`](../website/src/lib/demoVerify.ts) — `runDemoVerifyScenario` calls `verifyWorkflow` from the `workflow-verifier` package against repo `examples/` fixtures, captures truth report text, validates emitted JSON with `loadSchemaValidator("workflow-result")`.
- **Fixture resolution:** [`website/src/lib/resolveRepoExamples.ts`](../website/src/lib/resolveRepoExamples.ts) — probes `examples/` under `process.cwd()` and parent (supports dev from `website/` or repo root).
- **HTTP API:** [`website/src/app/api/demo/verify/route.ts`](../website/src/app/api/demo/verify/route.ts) — `POST` only for verification; `GET` returns `405` + `DEMO_METHOD_NOT_ALLOWED`.
- **Wire contract (Zod):** [`website/src/lib/demoVerify.contract.ts`](../website/src/lib/demoVerify.contract.ts) — success and error body shapes; error codes are stable strings.
- **Schema validation export:** [`src/index.ts`](../src/index.ts) re-exports `loadSchemaValidator` for the website and tests.
- **Regenerate static example snippets** after engine output changes: `npm run build` then `node scripts/generate-web-demo-snippets.mjs` (writes [`website/src/content/demoExampleSnippets.ts`](../website/src/content/demoExampleSnippets.ts)).

## Integrator

- **Dual SSOT:** [`docs/partner-quickstart-commands.md`](partner-quickstart-commands.md) (generated) is the **sole** source for copy-paste shell commands. [`docs/first-run-integration.md`](first-run-integration.md) is the **sole** prose SSOT (semantics, guarantees, mistakes). Regenerate commands with **`node scripts/generate-partner-quickstart-commands.mjs`**; CI checks via **`npm run check-partner-quickstart-ssot`**.
- **`/integrate`:** [`website/src/app/integrate/page.tsx`](../website/src/app/integrate/page.tsx) renders [`FirstRunActivationGuide`](../website/src/app/integrate/FirstRunActivationGuide.tsx) **above** the full markdown of `first-run-integration.md`. Both bodies are **build-embedded** from [`docs/partner-quickstart-commands.md`](partner-quickstart-commands.md) and [`docs/first-run-integration.md`](first-run-integration.md) via [`scripts/sync-integrator-docs-embedded.mjs`](../scripts/sync-integrator-docs-embedded.mjs) into [`website/src/generated/integratorDocsEmbedded.ts`](../website/src/generated/integratorDocsEmbedded.ts) ( **`website` `prebuild`** ) so serverless deploys do not read the monorepo `docs/` tree at runtime.
- **Bundled demo scenarios** on the homepage map to the same three `workflowId` values as the CLI examples; allowlist and contracts remain in [`website/src/lib/demoScenarioIds.ts`](../website/src/lib/demoScenarioIds.ts) and [`website/src/lib/demoVerify.contract.ts`](../website/src/lib/demoVerify.contract.ts).

## Funnel / observability (code normative)

- **Commercial funnel metadata (Zod):** [`website/src/lib/funnelCommercialMetadata.ts`](../website/src/lib/funnelCommercialMetadata.ts) — `reserve_allowed` and `checkout_started` jsonb shapes; used only from reserve and checkout routes.
- **Repeat-day analytics:** [`website/src/lib/funnelObservabilityQueries.ts`](../website/src/lib/funnelObservabilityQueries.ts) — `countDistinctReserveDaysForUser`; do not copy SQL elsewhere.
- **E2E proof:** [`website/__tests__/funnel-observability-chain.integration.test.ts`](../website/__tests__/funnel-observability-chain.integration.test.ts) runs under **`npm run validate-commercial`** (full `vitest run` from `website/`).
- **Migrations:** extending `funnel_event.event` CHECK requires a new `website/drizzle/0002_*.sql` **and** a matching entry in [`website/drizzle/meta/_journal.json`](../website/drizzle/meta/_journal.json).

## Operator

- **Node:** `>= 22.13.0` (website `engines` and `scripts/check-web-demo-prereqs.mjs`).
- **Build:** `npm run build:website` from repo root (builds the engine, then Next).
- **Vercel / serverless:** set `NEXT_CONFIG_TRACE_ROOT=1` so `examples/` and package `schemas/` are traced with the deployment (see [`website/next.config.ts`](../website/next.config.ts)).
- **Preflight:** `npm run check:web-demo-prereqs` — verifies Node, `node:sqlite`, fixture files, and read-only open of `demo.db`. Repo root **`npm run validate-commercial`** runs this after website Vitest (which itself requires **`DATABASE_URL`** and `drizzle-kit migrate`).
- **Next build auth:** `AUTH_SECRET` (and related env) remain required for full `next build` when API routes that touch auth are analyzed—see [`website/.env.example`](../website/.env.example).
- **Enterprise mailto:** `CONTACT_SALES_EMAIL` — bare email, validated at [`website/next.config.ts`](../website/next.config.ts) load; see [`website/.env.example`](../website/.env.example).

## Product copy

- **Homepage, pricing recap, sign-in framing, test ids:** [`website/src/content/productCopy.ts`](../website/src/content/productCopy.ts).
- **Site metadata (title / OpenGraph literals):** [`website/src/content/siteMetadata.ts`](../website/src/content/siteMetadata.ts).
- **Public anchors (GitHub, npm, one-liner, keywords):** [`website/src/lib/publicProductAnchors.ts`](../website/src/lib/publicProductAnchors.ts) imports [`config/public-product-anchors.json`](../config/public-product-anchors.json). **Outbound identity links** (repo, npm, served OpenAPI URL) live in the **footer** only — see [`website/src/app/SiteFooter.tsx`](../website/src/app/SiteFooter.tsx). This keeps marketing copy, README, npm `package.json`, and the site aligned without scattering hardcoded `github.com/...` strings.
- **Auth callback hardening:** [`website/src/lib/sanitizeInternalCallbackUrl.ts`](../website/src/lib/sanitizeInternalCallbackUrl.ts) — `emailSignInOptions` is what the sign-in page passes to `signIn("email", …)`.

### Discovery surfaces (machine + crawl + share)

**Why canonical production URLs:** **`/llms.txt`** (generated) and [`website/src/app/sitemap.ts`](../website/src/app/sitemap.ts) use **`productionCanonicalOrigin`** from [`config/public-product-anchors.json`](../config/public-product-anchors.json) so machine-readable links stay stable on production even when preview deploys use a different `NEXT_PUBLIC_APP_URL`.

- **Generated (gitignored, do not hand-edit):** [`website/public/llms.txt`](../website/public/llms.txt) and [`website/public/openapi-commercial-v1.yaml`](../website/public/openapi-commercial-v1.yaml) — written by [`scripts/public-product-anchors.cjs`](../scripts/public-product-anchors.cjs). **`website` `prebuild`** runs **`npm run sync:public-product-anchors`** from the repo root so these exist before `next build`.
- **Committed static asset:** [`website/public/og.png`](../website/public/og.png) — Open Graph / Twitter preview image; not generated.
- **Next.js routes:** [`website/src/app/sitemap.ts`](../website/src/app/sitemap.ts), [`website/src/app/robots.ts`](../website/src/app/robots.ts) — crawl hints at `/sitemap.xml` and `/robots.txt`.
- **HTML head:** [`website/src/app/layout.tsx`](../website/src/app/layout.tsx) sets `metadataBase`, Open Graph + Twitter card (image from [`website/src/content/siteMetadata.ts`](../website/src/content/siteMetadata.ts)), canonical `/`, and one `application/ld+json` **`SoftwareApplication`** block (repo + npm in `sameAs`).
- **npm registry fields:** Root [`package.json`](../package.json) **`description`**, **`keywords`**, **`homepage`**, **`repository`**, **`bugs`** are **only** updated by the same sync script from anchors — edit [`config/public-product-anchors.json`](../config/public-product-anchors.json) and run **`npm run sync:public-product-anchors`**.

**Integrator:** For tooling or assistants, prefer fetching **`/llms.txt`** and **`/openapi-commercial-v1.yaml`** on the canonical site origin over scraping prose docs.

## Pricing / plans

- Billing fields and tier blurbs: [`config/commercial-plans.json`](../config/commercial-plans.json) (`audience`, `valueUnlock` per plan). Numeric SSOT checks remain [`docs/commercial-ssot.md`](commercial-ssot.md) / `npm run check:commercial-ssot`.
