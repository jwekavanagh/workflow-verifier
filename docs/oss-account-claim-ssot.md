# OSS account claim bridge — single source of truth

Normative contract for converting **anonymous OSS CLI verification** into an **identified account** by binding a `run_id` to `user_id` after email sign-in. Commercial npm builds (`LICENSE_PREFLIGHT_ENABLED`) do not use this surface: they require an API key before verify.

**Not duplicated here:** North-star funnel definitions remain in [`funnel-observability-ssot.md`](funnel-observability-ssot.md) and [`growth-metrics-ssot.md`](growth-metrics-ssot.md). This document is the only SSOT for claim URLs, claim HTTP semantics, rate limits, and retention.

---

## Audiences

### Engineer

| Surface | Method | Path | Auth |
|---------|--------|------|------|
| Register claim ticket | `POST` | `/api/oss/claim-ticket` | None (CLI headers + JSON body) |
| Redeem ticket | `POST` | `/api/oss/claim-redeem` | Session (NextAuth) |
| Claim UI | `GET` | `/claim` | None (static shell + client behavior) |

**CLI POST origin (v1):** `resolveOssClaimApiOrigin()` in the CLI package returns **only** `PUBLIC_CANONICAL_SITE_ORIGIN` from anchor sync ([`src/publicDistribution.generated.ts`](../src/publicDistribution.generated.ts)), trailing slash stripped. **No** `AGENTSKEPTIC_TELEMETRY_ORIGIN`, **no** `LICENSE_API_BASE_URL`, **no** env override.

**stderr URL (OSS only):** After a successful quick or batch verify, when license preflight is disabled, stderr claim emission is enabled, and **`AGENTSKEPTIC_TELEMETRY` is not `0`**, the CLI prints one line:

`[agentskeptic] Link this verification run to your account (same browser): <origin>/claim#<claim_secret>`

- `claim_secret` is 32 random bytes as **64 lowercase hex** characters (URL-safe; no fragment encoding required).
- **stdout** must remain machine JSON only for batch/quick; claim text is **stderr only**.
- **`AGENTSKEPTIC_TELEMETRY=0`:** no stderr line from this helper and **no** claim-ticket `fetch` (silent), matching the product-activation opt-out in [`docs/funnel-observability-ssot.md`](funnel-observability-ssot.md).

**`POST /api/oss/claim-ticket`**

- **Headers:** Same as [`POST /api/funnel/product-activation`](../website/src/app/api/funnel/product-activation/route.ts): `X-AgentSkeptic-Product: cli`, `X-AgentSkeptic-Cli-Version` semver, `Content-Type: application/json`.
- **Body (JSON):** discriminated by **`schema_version`** (see [`website/src/lib/ossClaimTicketPayload.ts`](../website/src/lib/ossClaimTicketPayload.ts)):
  - **v1 (legacy):** `{ claim_secret, run_id, issued_at, terminal_status, workload_class, subcommand, build_profile }` — enums align with product-activation outcome payload; **no** `schema_version` key on the wire.
  - **v2:** v1 fields plus **`"schema_version": 2`** and required **`telemetry_source`**: `"local_dev"` \| `"unknown"`. Reject **`legacy_unattributed`** on the wire (**`400`**).
- **Persistence:** on first insert, nullable column **`telemetry_source`** is set from the v2 body or to **`legacy_unattributed`** for v1 rows.
- **`issued_at` skew:** ±300s vs server time (same constant as product-activation).
- **Responses:** `204` on insert or idempotent replay (same `claim_secret` / `secret_hash`); `400` / `403` / `413` empty body where aligned with product-activation; `429` JSON `{ "code": "rate_limited", "scope": "claim_ticket_ip" }`.

**`POST /api/oss/claim-redeem`**

- **Body:** `{ "claim_secret": "<64 hex>" }`.
- **Unauthenticated:** `401` empty body.
- **Success / idempotent (same user):** `200` JSON:

```json
{
  "schema_version": 1,
  "run_id": "...",
  "terminal_status": "complete|inconsistent|incomplete",
  "workload_class": "bundled_examples|non_bundled",
  "subcommand": "batch_verify|quick_verify",
  "build_profile": "oss|commercial",
  "claimed_at": "<ISO8601>"
}
```

- **Cross-user conflict:** `409` `{ "code": "already_claimed" }`.
- **All other failures** (unknown secret, expired ticket, malformed body): `400` `{ "code": "claim_failed" }` — **no subcodes** (avoids post-auth validity oracles).
- **Rate limit:** `429` `{ "code": "rate_limited", "scope": "claim_redeem_user" }`.

**DB tables**

- **`oss_claim_ticket`:** `secret_hash` PK (SHA-256 hex of UTF-8 `claim_secret`), outcome columns, `issued_at` text, `created_at`, `expires_at`, nullable `claimed_at` / `user_id`, nullable **`telemetry_source`** (v2 wire enum or **`legacy_unattributed`** for v1).
- **`oss_claim_rate_limit_counter`:** PK `(scope, window_start, scope_key)`; `scope` ∈ `claim_ticket_ip` | `claim_redeem_user`; `window_start` = UTC hour start (same convention as magic-link counters).

**Rate caps (fixed constants in [`website/src/lib/ossClaimRateLimits.ts`](../website/src/lib/ossClaimRateLimits.ts)):**

| Scope | Cap / UTC hour |
|-------|------------------|
| `claim_ticket_ip` | 60 new tickets per client IP key |
| `claim_redeem_user` | 30 successful first-time binds per `user_id` |

**Client IP key:** [`extractClientIpKey`](../website/src/lib/magicLinkSendGate.ts) — first `X-Forwarded-For` hop, else `CF-Connecting-IP`, else `X-Real-IP`, else literal `unknown` (shared bucket when proxy headers are absent).

**TTL:** `expires_at = created_at + 72h` (`OSS_CLAIM_TICKET_TTL_MS` in [`website/src/lib/ossClaimTicketTtl.ts`](../website/src/lib/ossClaimTicketTtl.ts)).

**Funnel:** On first successful bind, insert `funnel_event` `oss_claim_redeemed` with `user_id` and `{ schema_version: 1, run_id }`.

### Integrator

This flow is **not** part of [`schemas/openapi-commercial-v1.yaml`](../schemas/openapi-commercial-v1.yaml). Embedded integrators must not depend on claim routes.

### Operator

**Retention (v1):** No automatic deletion of `oss_claim_ticket` rows. Counting:

- **Claimed:** `claimed_at IS NOT NULL`
- **Active unclaimed:** `claimed_at IS NULL AND expires_at > now()`
- **Expired unclaimed:** `claimed_at IS NULL AND expires_at <= now()`

**Operator aggregates excluding local dev noise:** when counting tickets that represent non-local operator traffic, filter with **`telemetry_source IS DISTINCT FROM 'local_dev'`** (and remember **`unknown`** is not a guarantee of “external-only” origin—see [`docs/funnel-observability-ssot.md`](funnel-observability-ssot.md)).

**Same-browser requirement:** The claim secret is stored in `sessionStorage` under a fixed key after reading the URL hash. If the user opens the magic link on another device or clears storage before redeem, they must **re-run the CLI** for a new link. Documented in product copy (`ossClaimPage.sameBrowserRecovery`).

---

## Why these decisions

- **Canonical-only claim POST:** Avoids split-origin drift between telemetry and claim in v1; operators who send telemetry elsewhere still register tickets on the public canonical site until a future explicit env is introduced.
- **High-entropy `claim_secret` vs `run_id`:** `run_id` may be operator-chosen (CI job id); it must never be the sole bearer for binding.
- **Single `claim_failed` body:** Reduces information leakage after authentication.
- **Postgres hourly counters:** Same operational pattern as magic-link sends; `SERIALIZABLE` transactions with bounded retries for contention.
