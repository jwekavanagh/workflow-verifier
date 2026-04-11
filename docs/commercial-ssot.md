# Commercial layer — single source of truth

This document is the **narrative SSOT** for the thin commercial layer (website, billing, API keys, CLI preflight). It does **not** redefine CLI verification semantics—see [verification-product-ssot.md](verification-product-ssot.md) and [workflow-verifier.md](workflow-verifier.md).

**Related (integrator, not duplicated here):** [first-run-integration.md](first-run-integration.md) — run verification against your own SQL database; rendered on the site as **`/integrate`**.

## Approved product scope (v1)

**Original stakeholder narrative (reference):** Starter free (100/mo); Individual $25/mo (2k included); Team $100/mo (10k included, per-run overage); Business $300/mo (50k + volume); Enterprise custom.

**v1 implementation:**

- **Hard monthly caps** per plan from [`config/commercial-plans.json`](../config/commercial-plans.json). **Licensed** npm **`verify`**, **`quick`**, **`enforce`**, and **CI lock flags** on batch/quick require an **active Stripe subscription** on Individual, Team, Business, or Enterprise (including **trialing**), enforced in `POST /api/v1/usage/reserve`. **Starter** cannot pass licensed preflight until the user subscribes.
- **Per-run overage billing** ($0.01/run, volume discounts) is **deferred to v1.1+** (documented backlog; do not advertise on the live site until implemented).

**Enterprise** is **sales-assisted only** (mailto + operator SQL). It is **outside** the self-serve non-negotiable outcome and **outside** the binary `solved` verdict for the commercial funnel.

### Numeric limits (must match JSON)

<!-- commercial-plans-parity: embedded from config/commercial-plans.json — scripts/check-commercial-plans-ssot.mjs validates -->

| Plan       | Included verifications / month (v1 cap) | Monthly fee (v1) |
|------------|----------------------------------------|------------------|
| Starter    | 100                                    | Free             |
| Individual | 2000                                   | $25/mo           |
| Team       | 10000                                  | $100/mo          |
| Business   | 50000                                  | $300/mo          |
| Enterprise | Custom                                 | Custom           |

## Packaging and CLI build profiles

| Artifact              | `WF_BUILD_PROFILE` | Behavior |
|-----------------------|--------------------|----------|
| OSS / this repo CI    | `oss` (default)    | No license preflight; contract **`verify`** without API key; **`enforce` unavailable** — **[`docs/commercial-enforce-gate-normative.md`](commercial-enforce-gate-normative.md)** |
| Published npm tarball | `commercial`       | Requires `WORKFLOW_VERIFIER_API_KEY` + successful preflight for contract batch, quick verify, and **`enforce`** |

Codegen: **`node scripts/write-commercial-build-flags.mjs`** writes **`src/generated/commercialBuildFlags.ts`** (gitignored) before `tsc`. **`npm run build`** passes **`--oss`** so the default artifact stays OSS even if **`WF_BUILD_PROFILE`** is set in the shell; **`npm run build:commercial`** invokes the script with **`--commercial`** and requires **`COMMERCIAL_LICENSE_API_BASE_URL`**.

Forks: build with `oss` to omit the gate.

## HTTP — `POST /api/v1/usage/reserve`

- **Auth:** `Authorization: Bearer <api_key>`
- **Body:** `{"run_id": string, "issued_at": ISO8601, "intent"?: "verify"|"enforce"}`; reject if `|now - issued_at| > 300` seconds.
- **200:** `{"allowed":true,"plan","limit","used"}`
- **401:** invalid/revoked key
- **403:** `QUOTA_EXCEEDED`, `VERIFICATION_REQUIRES_SUBSCRIPTION`, `ENFORCEMENT_REQUIRES_PAID_PLAN`, `SUBSCRIPTION_INACTIVE`, or other entitlement/deny bodies; may include `upgrade_url`
- **400:** bad request
- **503:** server error

**Emergency:** `RESERVE_EMERGENCY_ALLOW=1` — valid keys on **individual/team/business/enterprise** bypass the **inactive subscription** check for **`verify`** and **`enforce`**. **Starter `verify` and `enforce` remain denied.** **Quota and idempotency unchanged** (still enforced).

## HTTP — `GET /api/v1/commercial/plans`

- **Auth:** none
- **200:** `{"schemaVersion", "plans"}` with public fields only (no Stripe price env key names). Same shapes as the OpenAPI `CommercialPlansResponse` component.

## Subscription state, Stripe webhooks, and account API

**Normative detail for billing sync, post-checkout UX, and deletion semantics lives here** (do not duplicate in other docs—link to this section).

### Stripe → database

- Webhooks: **`checkout.session.completed`**, **`customer.subscription.updated`**, **`customer.subscription.deleted`** (see [`website/README.md`](../website/README.md) for operator env).
- **`user.stripe_price_id`:** nullable; stores the primary recurring Stripe **Price** id from the subscription object. Used to compute **`priceMapping`** (`mapped` vs `unmapped`) on the account API without calling Stripe on every page load.
- **Tier (`user.plan`) for self-serve prices:** derived from that Price id via the same env-backed mapping as [`config/commercial-plans.json`](../config/commercial-plans.json) (`STRIPE_PRICE_*`). Checkout **metadata.plan** is not the long-term authority for tier.
- **Unknown Price id:** `plan` is left unchanged; `stripe_price_id` still records the id; logs `stripe_price_unmapped`; account shows **`priceMapping: unmapped`** and entitlement copy includes an operator-contact suffix.

### `customer.subscription.deleted`

Single row semantics (match subscription + customer when possible; else fall back to customer id):

- **`subscription_status`** → `inactive`
- **`plan`** → `starter`
- **`stripe_subscription_id`** and **`stripe_price_id`** → `null`
- **`stripe_customer_id`** unchanged (reuse for a future checkout)

### HTTP — `GET /api/account/commercial-state` (session cookie)

- **Auth:** signed-in website user (NextAuth session).
- **Query:** optional **`expectedPlan`** = `individual` | `team` | `business` only; any other value → **400**.
- **200 body (always):** `plan`, `subscriptionStatus`, `priceMapping`, `entitlementSummary`, `checkoutActivationReady`.
- **`checkoutActivationReady`:** `true` only when the query includes a valid **`expectedPlan`** and the user row satisfies **`plan === expectedPlan`**, **`subscriptionStatus === active`**, **`priceMapping === mapped`**, and licensed **`verify`** would proceed per [`website/src/lib/commercialEntitlement.ts`](../website/src/lib/commercialEntitlement.ts) (no emergency flag). Used by **`/account`** after Checkout success polling. **Trialing** in Stripe maps to **`active`** in the DB ([`website/src/lib/stripeSubscriptionStatus.ts`](../website/src/lib/stripeSubscriptionStatus.ts)).

**OpenAPI:** this route is **not** part of [`schemas/openapi-commercial-v1.yaml`](../schemas/openapi-commercial-v1.yaml).

### Operator verification

From the repo root, **`npm run validate-commercial`** requires **`DATABASE_URL`**, runs **`drizzle-kit migrate`** in **`website/`**, then full website Vitest (including funnel DB tests).

## Machine contracts (OpenAPI)

- **Normative file (repo):** [`schemas/openapi-commercial-v1.yaml`](../schemas/openapi-commercial-v1.yaml)
- **Deployed URL (static):** **`/openapi-commercial-v1.yaml`** on the app origin. The file is generated into **`website/public/`** during **`website` `prebuild`** by **`npm run sync:public-product-anchors`** from the repo root (via **`npm --prefix .. run sync:public-product-anchors`**), then served as a static asset. The committed copy under `schemas/` is the canonical spec for review; the public copy may use the effective deployment origin for `servers` and the self-URL.

### Public anchors and OpenAPI source

The editable OpenAPI “header” and distribution tokens live in [`schemas/openapi-commercial-v1.in.yaml`](../schemas/openapi-commercial-v1.in.yaml). [`schemas/openapi-commercial-v1.yaml`](../schemas/openapi-commercial-v1.yaml) is **generated** — do not hand-edit. Rationale (single source for URLs, valid OAS layout, no placeholder hosts): **[`docs/public-distribution-ssot.md`](public-distribution-ssot.md)**.

## `/integrate` documentation embedding

- **SSOT prose and commands** remain [`docs/first-run-integration.md`](first-run-integration.md) and [`docs/partner-quickstart-commands.md`](partner-quickstart-commands.md).
- **Website render** uses **build-embedded** strings in **`website/src/generated/integratorDocsEmbedded.ts`**, generated by **`node scripts/sync-integrator-docs-embedded.mjs`** ( **`website` `prebuild`** ). No runtime dependency on monorepo `docs/` paths for that page.

**Concurrency:** Monthly counter row must be locked with **`SELECT … FOR UPDATE`** in the same transaction as idempotent `(api_key_id, run_id)` insert.

## CLI environment

| Variable                         | Purpose |
|----------------------------------|---------|
| `WORKFLOW_VERIFIER_API_KEY`      | Plaintext API key (commercial build) |
| `WORKFLOW_VERIFIER_RUN_ID`       | Optional idempotency key (default: random UUID) |

Retries on 429/502/503/504: **250ms, 750ms, 2250ms** (3 attempts), then exit **3** `LICENSE_USAGE_UNAVAILABLE`.

Operational codes include: `LICENSE_KEY_MISSING`, `LICENSE_DENIED`, `LICENSE_USAGE_UNAVAILABLE`, `ENFORCEMENT_REQUIRES_PAID_PLAN`, `VERIFICATION_REQUIRES_SUBSCRIPTION`, `ENFORCE_REQUIRES_COMMERCIAL_BUILD`.

## Auth email (production vs E2E)

- **Production:** **Resend** SDK only (`resend` package).
- **E2E only:** When `E2E_COMMERCIAL_FUNNEL=1`, magic link email is sent via **Nodemailer SMTP** to **Mailpit** at `smtp://127.0.0.1:1025`. **Never** set `E2E_COMMERCIAL_FUNNEL` in production deploys.

## Legal effective date

[`config/legal-metadata.json`](../config/legal-metadata.json) is the **sole** source for `effectiveDate` and `termsVersion` (no env overrides).

## Database migrations

From `website/` with `DATABASE_URL` set:

```bash
npx drizzle-kit migrate
```

Migrations are generated in [`website/drizzle/`](../website/drizzle/) (e.g. `0000_initial.sql`).

## Validation matrix (Layer 2)

Services (see [`docker-compose.commercial-e2e.yml`](../docker-compose.commercial-e2e.yml)):

- **Postgres 16** — app `DATABASE_URL`. For **Supabase** on **Vercel**, use **`sslmode=require`** (or rely on helpers in [`website/src/db/ensureSslModeRequire.ts`](../website/src/db/ensureSslModeRequire.ts)): the **`postgres.js`** client uses **`ensureSslModeRequire()`**; **`drizzle-kit migrate`** uses **`node-pg`**, which currently treats bare `sslmode=require` like **`verify-full`** and can throw **`SELF_SIGNED_CERT_IN_CHAIN`**—so **`drizzle.config.ts`** uses **`ensureDatabaseUrlForNodePgDriver()`**, which adds **`uselibpqcompat=true`** as required by the `pg` / `pg-connection-string` migration warning.
- **Mailpit** — SMTP `127.0.0.1:1025`, UI/API `8025`

**Stripe CLI:** `stripe listen --forward-to <BASE_URL>/api/webhooks/stripe` — use the printed **`whsec_…`** as `STRIPE_WEBHOOK_SECRET` for that process.

**Mailpit messages API:** `GET http://127.0.0.1:8025/api/v1/messages` (see Mailpit docs for stable JSON shape).

## Enterprise operator runbook

```sql
-- Example: grant enterprise (exact table/column names follow Drizzle schema in website)
UPDATE "user" SET plan = 'enterprise', subscription_status = 'active' WHERE email = 'customer@example.com';
```

## API key storage

API keys are verified with **Node `crypto.scrypt`** (parameters fixed in website code and reviewed with security in mind). Store **salt + hash** only; show plaintext **once** at creation.

## Roadmap (v1.1+)

- Metered overage ($0.01/run Team, volume Business) via Stripe **after** a dedicated design pass.
