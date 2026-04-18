# Adoption epistemics — single source of truth

This document is the **SSOT** for **what the repository can prove versus what only integrators or operators can prove**, and for **how to read committed validation artifacts** without conflating CI coverage with market funnel performance.

**Normative detail elsewhere (do not duplicate here):**

- **HTTP semantics, beacon shapes, and `funnel_event` ingestion** — [`funnel-observability-ssot.md`](funnel-observability-ssot.md)
- **Metric ids, SQL, denominators, numerators, and explicit prohibitions** — [`growth-metrics-ssot.md`](growth-metrics-ssot.md)
- **PatternComplete checklist, IntegrateSpineComplete, Step 4 ProductionComplete commands** — [`first-run-integration.md`](first-run-integration.md)
- **Commercial billing, Stripe, `POST /api/v1/usage/reserve`** — [`commercial-ssot.md`](commercial-ssot.md)

## Four-way model (structural truth)

Four different notions are often conflated. They are **not interchangeable**.

| Layer | What it proves | Primary evidence in this repo |
|-------|----------------|--------------------------------|
| **PatternComplete** | Mechanical contract `verify` on **temp** artifact paths and a **SQLite DB copy under the OS temp directory** (not bundled example paths on the verify invocation); checklist IDs `AC-TRUST-*` / `AC-OPS-*`. | `node scripts/validate-adoption-complete.mjs` → [`artifacts/adoption-complete-validation-verdict.json`](../artifacts/adoption-complete-validation-verdict.json) |
| **IntegrateSpineComplete** | Full L0 bash from [`scripts/templates/integrate-activation-shell.bash`](../scripts/templates/integrate-activation-shell.bash): demo + mid-script PatternComplete-shaped segment + **final** bootstrap and contract `verify` on integrator-supplied `AGENTSKEPTIC_VERIFY_DB` (final verify may **not** satisfy AC-OPS-03 by design). | `node scripts/validate-integrate-spine.mjs` → [`artifacts/integrate-spine-validation-verdict.json`](../artifacts/integrate-spine-validation-verdict.json) |
| **ProductionComplete** | Contract verification (and/or bootstrap) against **the integrator’s** authoritative SQLite or Postgres and **their** structured tool activity / registry—ongoing ownership. | **Not** asserted by default `npm test`. Satisfied only when the integrator completes [Step 4](first-run-integration.md#step-4-bootstrap-when-you-have-your-own-tool_calls-and-a-db-url) (or equivalent) per [`first-run-integration.md`](first-run-integration.md). |
| **Telemetry KPIs** | **Operator observation** of anonymous or licensed beacons in Postgres—correlation and rolling rates per [`growth-metrics-ssot.md`](growth-metrics-ssot.md). | Production telemetry DB + queries; **not** proof of user-side correctness (see [User outcome vs telemetry capture](funnel-observability-ssot.md#user-outcome-vs-telemetry-capture-operator)). |

**Structural vs empirical:** The four-way table above is **structural** (definitions and repo proofs). **Where users drop off in production** is **empirical** and requires time-bounded data from telemetry and product analytics; that evidence is **not** committed in this repository.

## Structural throughput constraint

**Property (not a ranked funnel stage):** Company throughput is **structurally constrained** by the **first dependency on integrator-owned, correctly-shaped inputs**—structured tool activity and parameters the engine can ingest, a registry that maps `toolId` to SQL expectations, and read-only access to authoritative SQLite or Postgres—because that is the same moment the product becomes **epistemically “real”** (observed SQL vs expectations derived from declared activity) and **outside** what this repository can prove without the integrator’s data and credentials.

**What “integrator-owned” excludes (for this property):** Bundled demo fixtures, README-only replay, **PatternComplete** temp paths alone, or telemetry **`workload_class`** alone—see [Integrate spine](first-run-integration.md#integrate-spine-normative) vs [Step 4 / ProductionComplete](first-run-integration.md#step-4-bootstrap-when-you-have-your-own-tool_calls-and-a-db-url). **IntegrateSpineComplete** still uses repository-pinned bootstrap inputs for the final segment; **ProductionComplete** requires **their** events/registry (or bootstrap pack from **their** `tool_calls`) on **their** database per [`first-run-integration.md`](first-run-integration.md).

**What “correctly-shaped” means (pointers only):**

- **Structured tool activity** and ICP limits: [`verification-product-ssot.md`](verification-product-ssot.md) (core promise, exclusions).
- **Event line contract (NDJSON / observation model):** [Event line schema](agentskeptic.md#event-line-schema) in [`agentskeptic.md`](agentskeptic.md).
- **Registry and contract verify path:** [`first-run-integration.md`](first-run-integration.md) (spine and Step 4).

**Relationship to operator metrics:** Rolling rates that include **`workload_class` = `non_bundled`** are a **path heuristic** for “outside bundled example paths,” not proof of ProductionComplete, ICP fit, or user understanding—see [Qualification proxy (operator)](funnel-observability-ssot.md#qualification-proxy-operator) and [`growth-metrics-ssot.md`](growth-metrics-ssot.md).

**Dominant real-world drop-off:** **Which** link in the chain loses the most mass in production (evaluation vs install vs integrate spine vs Step 4 vs paid conversion) **cannot be ranked from this repository**; ranking requires time-bounded telemetry and context outside committed files (same epistemic line as **Structural vs empirical** above).

**Examples of what this property subsumes (not ranked facts):** a prospect lacks structured tool exports; a team cannot query the authoritative DB read-only; registry rows drift from schema; integrator stops after demo; spine succeeds but Step 4 on owned inputs never runs.

## Structural vs empirical vs telemetry proxies

Use these terms consistently:

- **Primary structural bottleneck / first dependency:** Same property as [Structural throughput constraint](#structural-throughput-constraint)—throughput cannot exceed integrator-owned, correctly-shaped inputs on authoritative SQL. This is **provable from repository definitions**; it is **not** a claim about which funnel stage loses the most mass in production without operator data.
- **Empirical (dominant) drop-off:** Which stage loses the most integrators **requires** time-bounded telemetry and context outside committed files—see **Dominant real-world drop-off** above and [`growth-metrics-ssot.md`](growth-metrics-ssot.md) (*Ranking dominant funnel loss*).
- **Telemetry L1 (path heuristic):** `workload_class = non_bundled` on activation rows ([`src/commercial/verifyWorkloadClassify.ts`](../src/commercial/verifyWorkloadClassify.ts))—not proof of ProductionComplete (see [Qualification proxy (operator)](funnel-observability-ssot.md#qualification-proxy-operator)).
- **Telemetry L2 (lineage heuristic):** `workflow_lineage = integrator_scoped` on **schema_version 3** activation rows ([`src/funnel/workflowLineageClassify.ts`](../src/funnel/workflowLineageClassify.ts))—excludes shipped catalog workflow ids and **`wf_integrate_spine`**; still **not** human **Decision-ready ProductionComplete** artifacts (A1–A5)—see [`growth-metrics-ssot.md`](growth-metrics-ssot.md) §**CrossSurface_ConversionRate_QualifiedIntegrateToIntegratorScopedVerifyOutcome_Rolling7dUtc**.

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
- Treating the **lowest** rolling cross-surface rate in [`growth-metrics-ssot.md`](growth-metrics-ssot.md) as proof of **which funnel stage loses the most mass** for real users — **invalid** without time-bounded telemetry and context outside this repository; see [Structural throughput constraint](#structural-throughput-constraint).
- Reading **`CrossSurface_ConversionRate_QualifiedIntegrateToVerifyOutcome_Rolling7dUtc`** as proof of ICP fit, dominant commercial bottleneck resolution, or a substitute for **user outcome** — **invalid**; see the operator cross-metric reading table in [`growth-metrics-ssot.md`](growth-metrics-ssot.md) and [Qualification proxy (operator)](funnel-observability-ssot.md#qualification-proxy-operator).
