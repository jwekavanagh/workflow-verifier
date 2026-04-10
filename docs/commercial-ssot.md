# Commercial layer — single source of truth

This document is the **narrative SSOT** for the thin commercial layer (website, billing, API keys, CLI preflight). It does **not** redefine CLI verification semantics—see [verification-product-ssot.md](verification-product-ssot.md) and [workflow-verifier.md](workflow-verifier.md).

**Related (integrator, not duplicated here):** [first-run-integration.md](first-run-integration.md) — run verification against your own SQL database; rendered on the site as **`/integrate`**.

## Approved product scope (v1)

**Original stakeholder narrative (reference):** Starter free (100/mo); Team $100/mo (10k included, per-run overage); Business $300/mo (50k + volume); Enterprise custom.

**v1 implementation:**

- **Hard monthly caps** per plan from [`config/commercial-plans.json`](../config/commercial-plans.json). Team/Business require an **active Stripe subscription** (enforced in `POST /api/v1/usage/reserve`).
- **Per-run overage billing** ($0.01/run, volume discounts) is **deferred to v1.1+** (documented backlog; do not advertise on the live site until implemented).

**Enterprise** is **sales-assisted only** (mailto + operator SQL). It is **outside** the self-serve non-negotiable outcome and **outside** the binary `solved` verdict for the commercial funnel.

### Numeric limits (must match JSON)

<!-- commercial-plans-parity: embedded from config/commercial-plans.json — scripts/check-commercial-plans-ssot.mjs validates -->

| Plan       | Included verifications / month (v1 cap) | Monthly fee (v1) |
|------------|----------------------------------------|------------------|
| Starter    | 100                                    | Free             |
| Team       | 10000                                  | $100/mo          |
| Business   | 50000                                  | $300/mo          |
| Enterprise | Custom                                 | Custom           |

## Packaging and CLI build profiles

| Artifact              | `WF_BUILD_PROFILE` | Behavior |
|-----------------------|--------------------|----------|
| OSS / this repo CI    | `oss` (default)    | No license preflight; contract mode works without API key |
| Published npm tarball | `commercial`       | Requires `WORKFLOW_VERIFIER_API_KEY` + successful preflight for contract batch and `enforce batch` |

Codegen: **`node scripts/write-commercial-build-flags.mjs`** writes **`src/generated/commercialBuildFlags.ts`** (gitignored) before `tsc`. Commercial builds require **`COMMERCIAL_LICENSE_API_BASE_URL`**.

Forks: build with `oss` to omit the gate.

## HTTP — `POST /api/v1/usage/reserve`

- **Auth:** `Authorization: Bearer <api_key>`
- **Body:** `{"run_id": string, "issued_at": ISO8601}`; reject if `|now - issued_at| > 300` seconds.
- **200:** `{"allowed":true,"plan","limit","used"}`
- **401:** invalid/revoked key
- **403:** `QUOTA_EXCEEDED` or `SUBSCRIPTION_INACTIVE`
- **400:** bad request
- **503:** server error

**Emergency:** `RESERVE_EMERGENCY_ALLOW=1` — valid keys bypass **quota and subscription** checks (still **401** if key invalid); usage counter **still increments** on allow.

**Concurrency:** Monthly counter row must be locked with **`SELECT … FOR UPDATE`** in the same transaction as idempotent `(api_key_id, run_id)` insert.

## CLI environment

| Variable                         | Purpose |
|----------------------------------|---------|
| `WORKFLOW_VERIFIER_API_KEY`      | Plaintext API key (commercial build) |
| `WORKFLOW_VERIFIER_RUN_ID`       | Optional idempotency key (default: random UUID) |

Retries on 429/502/503/504: **250ms, 750ms, 2250ms** (3 attempts), then exit **3** `LICENSE_USAGE_UNAVAILABLE`.

Operational codes: `LICENSE_KEY_MISSING`, `LICENSE_DENIED`, `LICENSE_USAGE_UNAVAILABLE`.

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

- **Postgres 16** — app `DATABASE_URL`
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
