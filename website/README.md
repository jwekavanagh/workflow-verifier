# Workflow Verifier — website

## Run locally (recommended)

```bash
# From repo root (after npm install)
cd website
copy .env.example .env   # then edit DATABASE_URL, AUTH_SECRET, etc.
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

- **Preflight** (Node ≥ 22.13, `node:sqlite`, fixture files): from repo root run **`npm run check:web-demo-prereqs`** (also executed at the end of **`npm run validate-commercial`**).

- After **engine output** changes, regenerate committed example snippets for the static **Example** section:

  ```bash
  npm run build
  npm run generate:web-demo-snippets
  ```

Architecture, contracts, and operator checklist: **[`docs/website-product-experience.md`](../docs/website-product-experience.md)**.

## Stripe webhooks and env (commercial)

Configure Stripe to send at least:

- **`checkout.session.completed`** — checkout success; user plan / subscription updates.
- **`customer.subscription.updated`** — keeps **`subscription_status`** in sync (**`active`** vs **`inactive`**).
- **`customer.subscription.deleted`** — subscription ended.

Set **`STRIPE_WEBHOOK_SECRET`** from `stripe listen --forward-to …/api/webhooks/stripe`. Use a Postgres **`DATABASE_URL`** with migrations applied.

**`CONTACT_SALES_EMAIL`** (bare email, regex in `website/.env.example`) is **required** so `next.config.ts` can load—`next dev` / `next build` fail without it.

**Website Vitest:** `__tests__/funnel-persistence.integration.test.ts` requires **`DATABASE_URL`** pointing at Postgres with migrations applied (`npx drizzle-kit migrate` from `website/`). From the repo root, **`npm run validate-commercial`** enforces **`DATABASE_URL`**, runs migrate, then runs full website Vitest.

Optional: **`RESERVE_EMERGENCY_ALLOW=1`** waives the **paid-plan + active subscription** check for **`intent=enforce`** only (never for starter). Quota still applies.

## Root package `prepublishOnly` (commercial CLI)

The repo root **`package.json`** runs **`prepublishOnly` → `node scripts/build-commercial.mjs`**. That commercial TypeScript build **requires** **`COMMERCIAL_LICENSE_API_BASE_URL`** set to your deployed site origin (the base URL for **`/api/v1/usage/reserve`**) so **`scripts/write-commercial-build-flags.mjs`** can embed the license API base in the published binary.
