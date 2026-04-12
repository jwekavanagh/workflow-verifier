# Website product experience (SSOT index)

This document explains how the commercial Next.js site works and points to **normative code** for contracts and copy. Do not duplicate guarantee tables or wire schemas here—edit the referenced files.

## Engineer

- **Demo runner:** [`website/src/lib/demoVerify.ts`](../website/src/lib/demoVerify.ts) — `runDemoVerifyScenario` calls `verifyWorkflow` from the `agentskeptic` package against repo `examples/` fixtures, captures truth report text, validates emitted JSON with `loadSchemaValidator("workflow-result")`.
- **Fixture resolution:** [`website/src/lib/resolveRepoExamples.ts`](../website/src/lib/resolveRepoExamples.ts) — probes `examples/` under `process.cwd()` and parent (supports dev from `website/` or repo root).
- **HTTP API:** [`website/src/app/api/demo/verify/route.ts`](../website/src/app/api/demo/verify/route.ts) — `POST` only for verification; `GET` returns `405` + `DEMO_METHOD_NOT_ALLOWED`.
- **Wire contract (Zod):** [`website/src/lib/demoVerify.contract.ts`](../website/src/lib/demoVerify.contract.ts) — success and error body shapes; error codes are stable strings.
- **Schema validation export:** [`src/index.ts`](../src/index.ts) re-exports `loadSchemaValidator` for the website and tests.

## Integrator

- **Dual SSOT:** [`docs/partner-quickstart-commands.md`](partner-quickstart-commands.md) (generated) is the **sole** source for copy-paste shell commands. [`docs/first-run-integration.md`](first-run-integration.md) is the **sole** prose SSOT (semantics, guarantees, mistakes). Regenerate commands with **`node scripts/generate-partner-quickstart-commands.mjs`**; CI checks via **`npm run check-partner-quickstart-ssot`**.
- **`/integrate`:** [`website/src/app/integrate/page.tsx`](../website/src/app/integrate/page.tsx) renders [`FirstRunActivationGuide`](../website/src/app/integrate/FirstRunActivationGuide.tsx) **above** the full markdown of `first-run-integration.md`. The full prose guide is inside a **`<details>`** element that is **closed by default** so the quickstart stays above the fold. Both bodies are **build-embedded** from [`docs/partner-quickstart-commands.md`](partner-quickstart-commands.md) and [`docs/first-run-integration.md`](first-run-integration.md) via [`scripts/sync-integrator-docs-embedded.mjs`](../scripts/sync-integrator-docs-embedded.mjs) into [`website/src/generated/integratorDocsEmbedded.ts`](../website/src/generated/integratorDocsEmbedded.ts) ( **`website` `prebuild`** ) so serverless deploys do not read the monorepo `docs/` tree at runtime.
- **Bundled demo scenarios** in **Try it** on the homepage map to the same three `workflowId` values as the CLI examples; allowlist and contracts remain in [`website/src/lib/demoScenarioIds.ts`](../website/src/lib/demoScenarioIds.ts) (including `DEMO_SCENARIO_PRESENTATION` labels) and [`website/src/lib/demoVerify.contract.ts`](../website/src/lib/demoVerify.contract.ts).

## Funnel / observability (code normative)

- **Commercial funnel metadata (Zod):** [`website/src/lib/funnelCommercialMetadata.ts`](../website/src/lib/funnelCommercialMetadata.ts) — `reserve_allowed` and `checkout_started` jsonb shapes; used only from reserve and checkout routes.
- **Repeat-day analytics:** [`website/src/lib/funnelObservabilityQueries.ts`](../website/src/lib/funnelObservabilityQueries.ts) — `countDistinctReserveDaysForUser`; do not copy SQL elsewhere.
- **E2E proof:** [`website/__tests__/funnel-observability-chain.integration.test.ts`](../website/__tests__/funnel-observability-chain.integration.test.ts) runs under **`npm run validate-commercial`** (full `vitest run` from `website/`).
- **Migrations:** extending `funnel_event.event` CHECK requires a new `website/drizzle/0002_*.sql` **and** a matching entry in [`website/drizzle/meta/_journal.json`](../website/drizzle/meta/_journal.json).

## Operator

- **Node:** `>= 22.13.0` (website `engines` and `scripts/check-web-demo-prereqs.mjs`).
- **Build:** `npm run build:website` from repo root (builds the engine, then Next).
- **Vercel / serverless:** set `NEXT_CONFIG_TRACE_ROOT=1` so `examples/` and package `schemas/` are traced with the deployment (see [`website/next.config.ts`](../website/next.config.ts)).
- **Preflight:** `npm run check:web-demo-prereqs` — verifies Node, `node:sqlite`, fixture files, and read-only open of `demo.db`. Repo root **`npm run validate-commercial`** runs this after website Vitest (which itself requires **`DATABASE_URL`** and `drizzle-kit migrate`), then **`scripts/pack-smoke-commercial.mjs`** and **`npm run build`** to restore OSS **`dist/`**.
- **Next build auth:** `AUTH_SECRET` (and related env) remain required for full `next build` when API routes that touch auth are analyzed—see [`website/.env.example`](../website/.env.example).
- **Enterprise mailto:** `CONTACT_SALES_EMAIL` — bare email, validated at [`website/next.config.ts`](../website/next.config.ts) load; see [`website/.env.example`](../website/.env.example).

## Product copy

- **Site chrome (header primary links, footer rows, homepage trust strip):** [`website/src/lib/siteChrome.ts`](../website/src/lib/siteChrome.ts) — four link-builder functions (`buildSiteHeaderPrimaryLinks`, `buildSiteFooterProductLinks`, `buildSiteFooterLegalLinks`, `buildHomeTrustStripLinks`) plus **`openapiHrefFromProcessEnv()`** for OpenAPI href resolution. Footer product links include **`/company`**.
- **Homepage, pricing recap, sign-in framing, test ids:** [`website/src/content/productCopy.ts`](../website/src/content/productCopy.ts).
- **Site metadata (title / OpenGraph literals):** [`website/src/content/siteMetadata.ts`](../website/src/content/siteMetadata.ts).
- **Public anchors (GitHub, npm, one-liner, keywords):** [`website/src/lib/publicProductAnchors.ts`](../website/src/lib/publicProductAnchors.ts) imports [`config/public-product-anchors.json`](../config/public-product-anchors.json). **Outbound identity links** (repo, npm, served OpenAPI URL) live in the **footer** product nav — see [`website/src/app/SiteFooter.tsx`](../website/src/app/SiteFooter.tsx) (footer also links **Security & Trust**, Privacy, and Terms). This keeps marketing copy, README, npm `package.json`, and the site aligned without scattering hardcoded `github.com/...` strings.
- **Auth callback hardening:** [`website/src/lib/sanitizeInternalCallbackUrl.ts`](../website/src/lib/sanitizeInternalCallbackUrl.ts) — `emailSignInOptions` is what the sign-in page passes to `signIn("email", …)`.

### Route render order (copy contract)

This section is the human-readable mirror of the Vitest contracts that read rendered HTML via **`siteTestServer`** / **`getSiteHtml`**.

1. **`/`** — Homepage `<main>` text order is: `heroTitle`, then `homepageDecisionFraming`, then `heroSubtitle`, then hero CTAs, then the trust strip from `buildHomeTrustStripLinks`, then `howItWorks` through `commercialSurface`; `homepageHero` why/what/when is not part of that `<main>` text stream. Causality and mechanism limits are covered by **`homepage-causality-invariant`**.
2. **`/database-truth-vs-traces`** — visitor answer block (`data-testid="visitor-problem-answer"`), `heroSubtitle`, terminal demo, ordered **`sections[]`**, then the deep-context closing block. Same acquisition slug string **`database-truth-vs-traces`** is used in nav and CTAs.
3. **`/pricing`** — recap copy, then the server-rendered `<ul aria-label="Commercial terms">` list asserted by **`pricing-commercial-terms-html`** (each item’s first child is a single `<strong>` lead).
4. **`/account`** — the server card renders **`AccountLicensedStepsList`** from [`website/src/components/account/AccountLicensedStepsList.tsx`](../website/src/components/account/AccountLicensedStepsList.tsx) (used from [`website/src/app/account/page.tsx`](../website/src/app/account/page.tsx); App Router `page.tsx` files cannot export arbitrary components) above the client entitlement UI so support steps stay in first paint HTML.
5. **`/integrate`** — exactly one `<main><h1>` whose text matches `siteMetadata.integrate.title` (see **`integrate-page-markup`**).

### Integrator: server-rendered commercial and account copy

Integrators should treat **`productCopy`** plus the acquisition JSON as the live strings for pricing recap, commercial terms bullets, account licensed steps, and sign-in framing, while long-form semantics remain in **`docs/first-run-integration.md`**. The **`pricing`** and **`account`** routes intentionally duplicate nothing that belongs only in the client bundle.

### Operator: post-change verification

When you change discovery acquisition JSON, **`productCopy.ts`**, or any route markup covered by the marketing Vitest suite, run **`npm run verify:web-marketing-copy`** from the repository root as the single gate before merging.

### Discovery surfaces (machine + crawl + share)

**Why canonical production URLs:** **`/llms.txt`** (generated) and [`website/src/app/sitemap.ts`](../website/src/app/sitemap.ts) use **`productionCanonicalOrigin`** from [`config/public-product-anchors.json`](../config/public-product-anchors.json) so machine-readable links stay stable on production even when preview deploys use a different `NEXT_PUBLIC_APP_URL`.

- **Acquisition SSOT:** [`config/discovery-acquisition.json`](../config/discovery-acquisition.json) drives the README **`discovery-readme-title`** and discovery fold (sync-written), extended **`/llms.txt`** (Primary links include canonical URLs plus **repo-raw** `llms.txt` and OpenAPI YAML; **`## Indexable guides`** from **`indexableGuides`**; **`shareableTerminalDemo`** renders a fenced pasteable transcript before **`## Intent phrases`**; **`## When this hurts (search-shaped)`** from `demandMoments`). **Indexable guides** (paths, hub, shell contract): [`docs/discovery-guides.md`](../docs/discovery-guides.md). **Homepage `/`** ([`website/src/app/page.tsx`](../website/src/app/page.tsx), [`website/src/app/page.sections.ts`](../website/src/app/page.sections.ts), [`website/src/content/productCopy.ts`](../website/src/content/productCopy.ts), [`website/src/lib/discoveryAcquisition.ts`](../website/src/lib/discoveryAcquisition.ts), [`website/src/lib/siteChrome.ts`](../website/src/lib/siteChrome.ts)) renders **Hero** (discovery `heroTitle`, `homepageDecisionFraming`, `heroSubtitle`, CTAs), **Trust strip** (links from `buildHomeTrustStripLinks`), then **How it works**, **Fit and limits**, **Try it**, and **Commercial** in `page.sections.ts` order. The long-form **`homepageHero`** why/what/when narrative is for `/database-truth-vs-traces` and README fold, not the homepage `<main>` stream (see **Route render order** above). Primary nav in [`website/src/app/SiteHeader.tsx`](../website/src/app/SiteHeader.tsx) maps `buildSiteHeaderPrimaryLinks` (plus auth links). **`/security`** is a lightweight Security & Trust page ([`website/src/app/security/page.tsx`](../website/src/app/security/page.tsx)); copy lives in [`website/src/content/productCopy.ts`](../website/src/content/productCopy.ts). **`/company`** is the operator/support surface. **`pageMetadata.description`** powers root layout meta / Open Graph / Twitter / JSON-LD ([`website/src/content/siteMetadata.ts`](../website/src/content/siteMetadata.ts), [`website/src/app/layout.tsx`](../website/src/app/layout.tsx)). CLI **`cliFollowupLines`** footer uses sync-generated **`src/publicDistribution.generated.ts`**. The citeable page **`/database-truth-vs-traces`** keeps the terminal demo block before narrative `sections`. Sync-generated **[`AGENTS.md`](../AGENTS.md)** machine entrypoints. Schema: [`config/discovery-acquisition.schema.json`](../config/discovery-acquisition.schema.json). Do not hand-edit prose inside README sync markers; change JSON and run **`npm run sync:public-product-anchors`**.
- **Generated (gitignored, do not hand-edit):** [`website/public/llms.txt`](../website/public/llms.txt) and [`website/public/openapi-commercial-v1.yaml`](../website/public/openapi-commercial-v1.yaml) — written by [`scripts/public-product-anchors.cjs`](../scripts/public-product-anchors.cjs). **`website` `prebuild`** runs **`npm run sync:public-product-anchors`** from the repo root so these exist before `next build`.
- **Committed static asset:** [`website/public/og.png`](../website/public/og.png) — Open Graph / Twitter preview image; not generated.
- **Next.js routes:** [`website/src/app/sitemap.ts`](../website/src/app/sitemap.ts) (merges **`indexableGuides[].path`** for guide URLs; omits noindex **`/guides`** hub), [`website/src/app/robots.ts`](../website/src/app/robots.ts) — crawl hints at `/sitemap.xml` and `/robots.txt`.
- **HTML head:** [`website/src/app/layout.tsx`](../website/src/app/layout.tsx) sets `metadataBase`, Open Graph + Twitter card (image from [`website/src/content/siteMetadata.ts`](../website/src/content/siteMetadata.ts)), canonical `/`, and one `application/ld+json` **`SoftwareApplication`** block (repo + npm in `sameAs`). Heading typography uses **`next/font/google`** (`DM_Sans`) with a CSS variable wired in [`website/src/app/globals.css`](../website/src/app/globals.css) (`--font-heading` on `h1`–`h3` and `.site-logo`).
- **npm registry fields:** Root [`package.json`](../package.json) **`description`** is written by sync from **`config/discovery-acquisition.json` → `pageMetadata.description`** (pain-led registry/unfurl copy). **`keywords`**, **`homepage`**, **`repository`**, **`bugs`** are written from [`config/public-product-anchors.json`](../config/public-product-anchors.json). **`identityOneLiner`** in anchors remains the precise line for OpenAPI / README anchor list / `llms.txt` Summary — not the npm `description`. Run **`npm run sync:public-product-anchors`** after editing either JSON file.

**Integrator:** For tooling or assistants, prefer fetching **`/llms.txt`** and **`/openapi-commercial-v1.yaml`** on the canonical site origin over scraping prose docs; when the canonical site is unavailable, use the **repo-raw** URLs listed under **`## Primary links`** in committed root **`llms.txt`**.

### Operator checklist — first inbound links

1. Pin a **GitHub Release** or **Discussion** (or the default README view) so evaluators land on the discovery fold or **`/database-truth-vs-traces`** on the canonical deployment.
2. Confirm the **npm** package page renders the same README discovery fold (published tarball root `README.md`).
3. After production deploy, verify **`{canonical}/llms.txt`**, **`{canonical}/database-truth-vs-traces`**, **`{canonical}/guides`**, and **`{canonical}/security`** return **200** and that `llms.txt` lists both canonical and repo-raw OpenAPI / `llms.txt` links and **`## Indexable guides`**.

## Commercial (pointers only)

- Plan marketing fields and numeric limits: [`config/commercial-plans.json`](../config/commercial-plans.json); parity checks: `npm run check:commercial-ssot` (see [`docs/commercial-ssot.md`](commercial-ssot.md)).
- Billing, subscriptions, Checkout, Customer Portal, webhooks, account commercial APIs, usage reserve, and OpenAPI contracts: normative only in [`docs/commercial-ssot.md`](commercial-ssot.md).
