# Website security and operations (SSOT)

Normative contracts for the Next.js website (`website/`). Audience sections are additive; this file is the single source of truth for the behaviors listed.

---

## Engineer

### Stripe webhook idempotency

- **Single mechanism:** Inside one `db.transaction` per delivery, the first persisted write is  
  `INSERT INTO stripe_event (id) VALUES ($eventId) ON CONFLICT (id) DO NOTHING RETURNING id`.
- **Empty `RETURNING`:** Another transaction already committed this `event.id`. Respond `200` with `{ "received": true, "duplicate": true }` and **no** business mutations in this transaction.
- **Non-empty `RETURNING`:** This transaction owns processing. Run `applyStripeWebhookDbSide(tx, event, ctx)` then commit. Any thrown error rolls back the insert and all mutations; Stripe retries remain safe.
- **No pre-transaction `SELECT`** on `stripe_event` for correctness (avoids dual rules).
- **Network I/O:** Only `getStripe().subscriptions.retrieve` for `checkout.session.completed` when `metadata.userId` and subscription id exist; runs **before** `db.transaction`. Forbidden inside the transaction: any Stripe call, `fetch`, or other I/O.
- **Implementation:** [`website/src/app/api/webhooks/stripe/route.ts`](../website/src/app/api/webhooks/stripe/route.ts), [`website/src/lib/applyStripeWebhookDbSide.ts`](../website/src/lib/applyStripeWebhookDbSide.ts).

### `applyStripeWebhookDbSide(tx, event, ctx)`

- **Signature:** `applyStripeWebhookDbSide(tx, event, ctx): Promise<void>` — `tx` is the Drizzle client for the active transaction (same schema as `db`).
- **`ctx`:** `{ checkoutSubscription?: Stripe.Subscription | null }` — populated only for `checkout.session.completed` after pre-transaction `retrieve`; otherwise omit or pass `null`.
- **Must not** insert into `stripe_event` or perform network I/O.

### Canonical site origin

- **Function:** `getCanonicalSiteOrigin()` in [`website/src/lib/canonicalSiteOrigin.ts`](../website/src/lib/canonicalSiteOrigin.ts) — **no `Request` / forwarded headers**.
- **Precedence:** (1) non-empty `NEXT_PUBLIC_APP_URL` → `new URL(raw).origin`; (2) if `VERCEL_ENV === "production"` and URL empty → **throw** `NEXT_PUBLIC_APP_URL is required when VERCEL_ENV=production`; (3) else if `NODE_ENV` is `development` or `test` → `http://127.0.0.1:3000`; (4) else → `publicProductAnchors.productionCanonicalOrigin` (trimmed trailing slash).
- **Call sites for server-built absolute URLs:** public verification reports POST, usage reserve `upgrade_url`, checkout `baseUrl`, billing portal `return_url`.

### Checkout JSON errors

- Validation/auth responses keep existing stable `error` strings (`Unauthorized`, `Invalid plan`, etc.).
- Stripe and unexpected handler failures return `{ "error": "CHECKOUT_FAILED" }` (including missing checkout URL / 502). No Stripe exception text in JSON.

### API key revoke

- **Route:** `POST /api/account/revoke-key`
- **401:** `{ "error": "UNAUTHORIZED" }`
- **200:** `{ "ok": true, "revoked": true }` if a row was updated; `{ "ok": true, "revoked": false }` if no active key (idempotent).

### HTTP security headers

- **Frozen constants:** [`website/src/lib/httpSecurityHeaders.ts`](../website/src/lib/httpSecurityHeaders.ts) — imported by [`website/next.config.ts`](../website/next.config.ts) and asserted in tests. Do not change CSP without updating tests and this document.

### Production commercial guards

- **`productionLike`:** `process.env.VERCEL_ENV === "production"` only.
- **Forbidden when production-like:** `E2E_COMMERCIAL_FUNNEL === "1"` OR `RESERVE_EMERGENCY_ALLOW === "1"`.
- **Throw message (exact):**  
  `AGENTSKEPTIC_PRODUCTION_COMMERCIAL_GUARD_VIOLATION: E2E_COMMERCIAL_FUNNEL and RESERVE_EMERGENCY_ALLOW must not be enabled when VERCEL_ENV=production`
- **Execution:** [`website/instrumentation.ts`](../website/instrumentation.ts) `register()` calls `assertProductionCommercialGuards()` synchronously on Node server cold start.
- **Limitation:** Covers the Node.js App Router server bundle, not arbitrary edge-only entrypoints.

### Funnel logging in transactions

- `logFunnelEvent(input, tx?)` — when `tx` is passed, insert runs on the transaction client and errors propagate (webhook). Without `tx`, failures are best-effort logged to stderr.

---

## Integrator

- **New endpoint:** `POST /api/account/revoke-key` — same session cookie as other account routes. Response shapes above.
- **Public report share URL:** The `url` field in `POST /api/public/verification-reports` uses `getCanonicalSiteOrigin()` only; hostile `X-Forwarded-Host` does not change the origin.

---

## Operator

- **Vercel production:** Set `VERCEL_ENV=production` (Vercel default on Production). Set `NEXT_PUBLIC_APP_URL` to the canonical public origin (must match [`config/public-product-anchors.json`](../config/public-product-anchors.json) `productionCanonicalOrigin` per existing build parity checks).
- **Forbidden in Vercel Production:** `E2E_COMMERCIAL_FUNNEL=1`, `RESERVE_EMERGENCY_ALLOW=1` — deployment will fail cold start with the guard violation message in runtime logs until removed.
- **Stripe webhooks:** Endpoint `/api/webhooks/stripe`; use signing secret in `STRIPE_WEBHOOK_SECRET`. Retries after transient failures are safe by design.
- **`next build`:** Requires `AUTH_SECRET` (≥32 chars) in CI/local for static collection, as before.

---

## Why these decisions

- **Claim-first insert in one transaction** removes the class of bugs where `stripe_event` was inserted before business logic succeeded, causing permanent skip on Stripe retry.
- **Canonical origin** removes trust in client-controlled proxy headers for customer-visible URLs.
- **`CHECKOUT_FAILED`** avoids leaking Stripe internal errors to browsers while preserving operator logs server-side.
- **Instrumentation guards** fail fast on dangerous env combinations in real production (`VERCEL_ENV=production`), without relying on every route being hit.
- **Self-hosted production** not on Vercel: set `VERCEL_ENV=production` if you require the same guard semantics, or accept that guards key off `VERCEL_ENV` only per contract above.
