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

- **First run on your database (SSOT):** [`docs/first-run-integration.md`](first-run-integration.md) — same content as site route **`/integrate`** ([`website/src/app/integrate/page.tsx`](../website/src/app/integrate/page.tsx), resolves `docs/` via [`website/src/lib/resolveRepoDoc.ts`](../website/src/lib/resolveRepoDoc.ts)).
- **Bundled demo scenarios** on the homepage map to the same three `workflowId` values as the CLI examples; allowlist and contracts remain in [`website/src/lib/demoScenarioIds.ts`](../website/src/lib/demoScenarioIds.ts) and [`website/src/lib/demoVerify.contract.ts`](../website/src/lib/demoVerify.contract.ts).

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
- **Auth callback hardening:** [`website/src/lib/sanitizeInternalCallbackUrl.ts`](../website/src/lib/sanitizeInternalCallbackUrl.ts) — `emailSignInOptions` is what the sign-in page passes to `signIn("email", …)`.

## Pricing / plans

- Billing fields and tier blurbs: [`config/commercial-plans.json`](../config/commercial-plans.json) (`audience`, `valueUnlock` per plan). Numeric SSOT checks remain [`docs/commercial-ssot.md`](commercial-ssot.md) / `npm run check:commercial-ssot`.
