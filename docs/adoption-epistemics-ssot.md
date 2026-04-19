# Adoption epistemics — single source of truth

**Epistemic contract (normative definitions, single authored source):** [`epistemic-contract.md`](epistemic-contract.md)—grounded output vs funnel dominance, first necessary constraint on grounded output, structural vs empirical vs telemetry proxies, and what must not be inferred from repository evidence alone. **Do not restate that contract here.**

This document is the **SSOT** for the **four-way proof model**, **ProductionComplete / Decision-ready** checklists and artifacts, **commercial validation verdict** field semantics, and **negative validation** (invalid readings). For beacon HTTP, growth SQL, first-run commands, and billing, follow the links below—do not duplicate those contracts here.

**Normative detail elsewhere (do not duplicate here):**

- **Epistemic contract (grounded vs funnel, proxies, ranking limits)** — [`epistemic-contract.md`](epistemic-contract.md)
- **HTTP semantics, beacon shapes, and `funnel_event` ingestion** — [`funnel-observability-ssot.md`](funnel-observability-ssot.md)
- **Metric ids, SQL, denominators, numerators, and explicit prohibitions** — [`growth-metrics-ssot.md`](growth-metrics-ssot.md)
- **PatternComplete checklist, IntegrateSpineComplete, Step 4 ProductionComplete commands** — [`first-run-integration.md`](first-run-integration.md)
- **Commercial billing, Stripe, `POST /api/v1/usage/reserve`** — [`commercial-ssot.md`](commercial-ssot.md)

## Four-way model (structural truth)

Four different notions are often conflated. They are **not interchangeable**.

| Layer | What it proves | Primary evidence in this repo |
|-------|----------------|--------------------------------|
| **PatternComplete** | Mechanical contract `verify` on **temp** artifact paths and a **SQLite DB copy under the OS temp directory** (not bundled example paths on the verify invocation); checklist IDs `AC-TRUST-*` / `AC-OPS-*`. | `node scripts/validate-adoption-complete.mjs` → [`artifacts/adoption-complete-validation-verdict.json`](../artifacts/adoption-complete-validation-verdict.json) |
| **IntegrateSpineComplete** | Full L0 bash from [`scripts/templates/integrate-activation-shell.bash`](../scripts/templates/integrate-activation-shell.bash): demo + mid-script PatternComplete-shaped segment + **final** bootstrap and **`verify-integrator-owned`** on integrator-supplied `AGENTSKEPTIC_VERIFY_DB` (final verify may **not** satisfy AC-OPS-03 by design). | `node scripts/validate-integrate-spine.mjs` → [`artifacts/integrate-spine-validation-verdict.json`](../artifacts/integrate-spine-validation-verdict.json) |
| **ProductionComplete** | Contract verification (and/or bootstrap) against **the integrator’s** authoritative SQLite or Postgres and **their** structured tool activity / registry—ongoing ownership. | **Not** asserted by default `npm test`. Satisfied only when the integrator completes [Step 4](first-run-integration.md#step-4-bootstrap-when-you-have-your-own-tool_calls-and-a-db-url) (or equivalent) per [`first-run-integration.md`](first-run-integration.md). |
| **Telemetry KPIs** | **Operator observation** of anonymous or licensed beacons in Postgres—correlation and rolling rates per [`growth-metrics-ssot.md`](growth-metrics-ssot.md). | Production telemetry DB + queries; **not** proof of user-side correctness (see [User outcome vs telemetry capture](funnel-observability-ssot.md#user-outcome-vs-telemetry-capture-operator)). |

**Structural vs empirical (pointer):** The four-way table below is **structural** (definitions and repo proofs). **Where users drop off in production** is **empirical**—normative definitions and proxy vocabulary live only in [`epistemic-contract.md`](epistemic-contract.md).

## Commercial validation verdict (`artifacts/commercial-validation-verdict.json`)

Written by [`scripts/validate-commercial-funnel.mjs`](../scripts/validate-commercial-funnel.mjs).

### `layers.regression`

**True** when the script successfully completed the **regression** portion of commercial validation (commercial plans SSOT, builds, website Vitest harness steps, pack-smoke, registry-draft harness, OSS restore, etc.—see script body). **False** if the script exited before marking regression complete.

### `layers.playwrightCommercialE2e`

**True** only when **`COMMERCIAL_VALIDATE_PLAYWRIGHT=1`** and the Playwright suite (`playwright.commercial.config.ts`) **exits successfully** inside that same script run.

**False** when Playwright was **not** run (default) or when Playwright failed.

**This boolean is not a market funnel metric.** It does **not** measure acquisition conversion, integrate conversion, or revenue. It names **whether optional browser-level commercial E2E tests ran and passed** in that validation invocation.

**One-sentence reader rule:** `playwrightCommercialE2e: false` means “Playwright commercial E2E was not executed successfully in this `validate-commercial-funnel` run (usually because `COMMERCIAL_VALIDATE_PLAYWRIGHT` was unset),” **not** “the business funnel failed.”

### `COMMERCIAL_REQUIRE_LAYER2`

When set to **`1`**, the script requires **`layers.playwrightCommercialE2e === true`** for final `status: solved`. That is a **Playwright coverage gate**, not a North Star KPI gate.

## ProductionComplete cohort checklist (operator)

Use this checklist when a human operator assists an integrator to reach **ProductionComplete** outside CI. **Completion** means every item is satisfied and **artifacts** (stdout JSON paths or equivalent) are retained by the integrator or operator for their records.

1. ** Preconditions:** Integrator has **structured tool activity** (NDJSON or bootstrap-capable `tool_calls` input) and **read-only** access to **their** SQLite or Postgres per [`verification-product-ssot.md`](verification-product-ssot.md) ICP.
2. **Trust doctrine:** Integrator has read [What this does not prove](verification-product-ssot.md#what-this-does-not-prove-trust-boundary) and [Quick Verify positioning](verification-product-ssot.md#quick-verify-positioning) if Quick is in scope.
3. **Bootstrap or registry:** Either run `agentskeptic bootstrap` with **their** `BootstrapPackInput` v1 JSON and DB per [Step 4](first-run-integration.md#step-4-bootstrap-when-you-have-your-own-tool_calls-and-a-db-url), or supply committed **events.ndjson** + **tools.json** they own.
4. **Contract verify:** Run contract batch `verify` with **their** `--events`, `--registry`, and exactly one of `--db` / `--postgres-url`; capture **exit code** and **stdout** `WorkflowResult` JSON.
5. **Success criteria (normative):** Meet **Decision-ready ProductionComplete** as defined in [§ Decision-ready ProductionComplete (normative)](#decision-ready-productioncomplete-normative) (pass, explained mismatch, or explained incomplete, each with artifacts **A1–A5** specified in that subsection—not "green only").
6. **Negative (not ProductionComplete):** Missing registry entries, wrong `--workflow-id`, unreadable DB URL, or stopping at demo / PatternComplete / IntegrateSpineComplete alone without Step 4 on **their** inputs.

### Decision-ready ProductionComplete (normative)

1. **Definition.** A run is **Decision-ready ProductionComplete** when cohort checklist items **1–4** and **6** are satisfied and the **Acceptance rules** and artifact obligations **A1–A5** in this subsection are satisfied.

2. **Minimum artifact set (integrator- or operator-retained).** All of the following must exist in durable storage (git, CI artifact store, ticket, or operator log) for the **same** invocation:
   - **A1 — Machine outcome:** The full stdout payload: exactly one terminal **`WorkflowResult`** JSON object for contract batch verification (the same object the CLI prints on stdout per [docs/verification-operational-notes.md](verification-operational-notes.md) integrator contract).
   - **A2 — Process outcome:** Integer **exit code** for that invocation.
   - **A3 — Human layer:** Either the default **stderr human verification report** text for that invocation, **or** an explicit written record that the invocation used **`--no-truth-report`** and therefore stderr was intentionally suppressed (so reviewers do not infer silence means success).
   - **A4 — Inputs scope attestation:** A short written statement (one sentence minimum) identifying that **`--events`** and **`--registry`** (or the bootstrap output directory used as their stand-in) were **integrator-owned** for this invocation—not solely the shipped `examples/*.ndjson` / `examples/*.tools.json` pair used for demos—**or** that the invocation was an explicitly labeled **drill / reproduction** on bundled fixtures (in which case the outcome is **not** Decision-ready ProductionComplete, but **PatternComplete** or pedagogy only).

3. **Acceptance rules.** Subject to A1–A4:
   - **Pass:** Exit code `0`, workflow `status` is `complete`, and every observed step in the asserted scope is `verified`.
   - **Explained mismatch (decision-ready):** Terminal workflow status **`inconsistent`** **or** any step in scope with status **`missing`** / non-verified with reason codes present in stdout JSON, **and** **A5** below.
   - **Explained incomplete (decision-ready):** Terminal workflow status **`incomplete`**, **and** **A5** below.
   - **A5 — Documented:** A dated note (ticket, PR, or operator log entry) tying the captured A1–A3 to the next concrete action (registry edit, DB fix, workflow id fix, scope change). *Without A5, a non-pass is not Decision-ready ProductionComplete—it is only a raw failed run.*

4. **Ownership.** The integrator (or operator assisting them) owns retention of A1–A5; the repository cannot assert Decision-ready ProductionComplete in CI without those artifacts.

**This repository cannot automate step 3–5 on integrator production systems** without their credentials and data; CI proves **PatternComplete** and **IntegrateSpineComplete** shapes only.

## Negative validation (what “not solved” means here)

- Treating **`layers.playwrightCommercialE2e: false`** in [`artifacts/commercial-validation-verdict.json`](../artifacts/commercial-validation-verdict.json) as evidence that **operator funnel conversion** is low — **invalid** reading.
- Claiming **`npm test` green** implies a specific customer reached **ProductionComplete** — **invalid** unless that customer’s Step 4 evidence exists outside this repo.
- Inferring **no verification ran** from **missing** `verify_outcome` telemetry alone — **invalid** without ruling out opt-out, transport failure, split deployment, or missing `funnel_anon_id` per [`growth-metrics-ssot.md`](growth-metrics-ssot.md) and [`funnel-observability-ssot.md`](funnel-observability-ssot.md).
- Treating the **lowest** rolling cross-surface rate in [`growth-metrics-ssot.md`](growth-metrics-ssot.md) as proof of **which funnel stage loses the most mass** for real users — **invalid** without time-bounded telemetry and context outside this repository; see [`epistemic-contract.md`](epistemic-contract.md).
- Reading **`CrossSurface_ConversionRate_QualifiedIntegrateToVerifyOutcome_Rolling7dUtc`** as proof of ICP fit, dominant commercial bottleneck resolution, or a substitute for **user outcome** — **invalid**; see the operator cross-metric reading table in [`growth-metrics-ssot.md`](growth-metrics-ssot.md) and [Qualification proxy (operator)](funnel-observability-ssot.md#qualification-proxy-operator).
