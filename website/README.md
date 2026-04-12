# AgentSkeptic — website

## Run locally (recommended)

```bash
# From repo root (after npm install)
cd website
copy .env.example .env   # then edit DATABASE_URL (Supabase/Vercel: sslmode=require; app and drizzle.config auto-append TLS params for non-localhost URLs), AUTH_SECRET, etc.
npx drizzle-kit migrate
npm run dev
```

Open **http://127.0.0.1:3000** (not only `localhost` if your env binds oddly).

Use **`npm run dev`** for day-to-day work. Use **`npm run build` + `npm run start`** only when you need a production-like run.

## If `next build` fails with `EBUSY` (Windows)

Another process is locking `website/.next` (common with **OneDrive** under `OneDrive\projects\...`).

1. Stop any running `next start` / `next dev` (Ctrl+C).
2. Close anything that might scan the folder (optional: pause OneDrive sync for this directory).
3. Delete the cache and rebuild:

   ```powershell
   Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
   npm run build
   ```

4. If it still fails, keep using **`npm run dev`** (no full trace step like production build).

## Vercel / CI monorepo tracing

Set env **`NEXT_CONFIG_TRACE_ROOT=1`** on the **website** build so `outputFileTracingRoot` includes the repo root (not needed for local `npm run dev`).

## Engine build, demo API, and fixtures

The homepage **Try it** flow calls `POST /api/demo/verify`, which runs the same `verifyWorkflow` engine as the CLI against repo **`examples/`** files.

- From **repo root**, build the engine before relying on the demo API or running **`npm run build`** inside `website/`:

  ```bash
  npm run build
  ```

  Or build engine + site in one step:

  ```bash
  npm run build:website
  ```

- **Preflight** (Node ≥ 22.13, `node:sqlite`, fixture files): from repo root run **`npm run check:web-demo-prereqs`** (also run during **`npm run validate-commercial`**, before **`scripts/pack-smoke-commercial.mjs`**; ad hoc check: **`npm run pack-smoke`** from repo root).

Architecture, contracts, and operator checklist: **[`docs/website-product-experience.md`](../docs/website-product-experience.md)**.

**Partner quickstart (repo root):** `npm run partner-quickstart` (see root `package.json`). **`/integrate`** renders generated **[`docs/partner-quickstart-commands.md`](../docs/partner-quickstart-commands.md)** then **[`docs/first-run-integration.md`](../docs/first-run-integration.md)**.

## Commercial operator env (Stripe, webhooks, account APIs)

Required for the licensed website surface: **`DATABASE_URL`**, **`STRIPE_SECRET_KEY`**, **`STRIPE_WEBHOOK_SECRET`**, **`STRIPE_PRICE_*`** keys referenced from [`config/commercial-plans.json`](../config/commercial-plans.json), **`NEXT_PUBLIC_APP_URL`**, **`AUTH_SECRET`**, **`CONTACT_SALES_EMAIL`** (bare email — `website/.env.example`).

Forward Stripe webhooks to **`/api/webhooks/stripe`** (local: `stripe listen --forward-to <BASE_URL>/api/webhooks/stripe`; use the printed secret as **`STRIPE_WEBHOOK_SECRET`**).

Normative contracts (webhook event list, Checkout vs Billing Portal, account **`commercial-state`** and **`billing-portal`** routes, reserve **`BILLING_PRICE_UNMAPPED`**, emergency flag semantics): **[`docs/commercial-ssot.md`](../docs/commercial-ssot.md)** — *Commercial layer — single source of truth*.

**Website Vitest:** from the repo root, **`npm run validate-commercial`** enforces **`DATABASE_URL`**, runs migrate in **`website/`**, then full website Vitest, then **`scripts/pack-smoke-commercial.mjs`** and **`npm run build`** to restore OSS **`dist/`**.

**`RESERVE_EMERGENCY_ALLOW=1`:** see SSOT — waives inactive-subscription checks only where documented; does not bypass **`BILLING_PRICE_UNMAPPED`**.

## Root package `prepublishOnly` (commercial CLI)

The repo root **`package.json`** runs **`prepublishOnly` → `node scripts/build-commercial.mjs`**. That commercial TypeScript build **requires** **`COMMERCIAL_LICENSE_API_BASE_URL`** set to your deployed site origin (the base URL for **`/api/v1/usage/reserve`**) so **`scripts/write-commercial-build-flags.mjs`** can embed **`LICENSE_API_BASE_URL`** in **`dist/generated/commercialBuildFlags.js`** (consumed by the CLI preflight module).
