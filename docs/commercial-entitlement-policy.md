# Commercial entitlement policy

This document is the **hand-authored** source for **why** the product gates certain capabilities. Machine-readable entitlement rows live in [`config/commercial-entitlement-matrix.v1.json`](../config/commercial-entitlement-matrix.v1.json). The generated table is [`commercial-entitlement-matrix.md`](commercial-entitlement-matrix.md).

**Implementation SSOT (reserve bodies, codes, Stripe lifecycle, account `commercial-state`, deletion policy):** **[`docs/commercial-ssot.md`](commercial-ssot.md)** — section *Subscription state, Stripe webhooks, and account API*.

**Free vs paid capability matrix (OSS, commercial npm, Starter account):** **[`docs/commercial-ssot.md`](commercial-ssot.md)** — subsection *Free vs paid boundary (normative v1)*. Do not duplicate that matrix here.

The **OSS** default build does not expose **`enforce`** (exit **`ENFORCE_REQUIRES_COMMERCIAL_BUILD`**); entitlement rows below apply to **commercial** CLI builds. See **[`docs/commercial-enforce-gate-normative.md`](commercial-enforce-gate-normative.md)**.

## Why licensed `verify` requires an active subscription

The **published npm** path is gated in **`POST /api/v1/usage/reserve`** so contract **`verify`** (and related licensed flows) require an **active** Stripe-backed subscription on a paid-capable plan (including **trialing**). **Starter** cannot pass **`verify`** until they subscribe (`VERIFICATION_REQUIRES_SUBSCRIPTION`). **Monthly quota** applies only after entitlement allows the run (Starter has **`includedMonthly: 0`** in config and is denied at entitlement, so there is no usable paid allowance on Starter). See the SSOT section above for the exact HTTP contract and CLI preflight behavior (including **`SUBSCRIPTION_INACTIVE`** and **`upgrade_url`** on denials).

**OSS builds** from source (`WF_BUILD_PROFILE=oss`) do not call the license server and are not subscription-gated—see README and [`commercial-enforce-gate-normative.md`](commercial-enforce-gate-normative.md).

## Why `enforce` and CI locks share the same paid gate

**Licensed `verify` / `quick` with `--output-lock`** uses **`intent=verify`** on reserve (metered lock generation). **`--expect-lock`**, **`agentskeptic enforce`**, and other enforcement-shaped paths use **`intent=enforce`** with the same active-subscription requirement as licensed **`verify`** (SSOT; see [`commercial-enforce-gate-normative.md`](commercial-enforce-gate-normative.md)).

## Why `starter` cannot `verify` or `enforce` on commercial npm

The **starter** plan is an **account + upgrade path** on the commercial surface. **`verify`** returns `VERIFICATION_REQUIRES_SUBSCRIPTION`; **`enforce`** returns `ENFORCEMENT_REQUIRES_PAID_PLAN`, each with an **`upgrade_url`** when the license server provides one.

## `RESERVE_EMERGENCY_ALLOW`

When `RESERVE_EMERGENCY_ALLOW=1` on the server, the **subscription check for paid-plan `verify` and `enforce`** is waived (operations break-glass). **Starter `verify` and `enforce` remain denied.** **Quota and idempotency still apply**—emergency does not bypass monthly limits.

## Pricing surface (normative user-visible lines)

The `/pricing` page must show the following two lines **verbatim** (drift is caught by `test/commercial-pricing-policy-parity.test.mjs` and Playwright).

<!-- commercial-pricing-lines-begin -->
Licensed verification with the published npm CLI requires an active Individual, Team, Business, or Enterprise subscription (trial counts); monthly quota applies after subscribe.
CI locks, the enforce command, and quick verify with lock flags use the same subscription requirement.
<!-- commercial-pricing-lines-end -->
