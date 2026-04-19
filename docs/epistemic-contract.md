# Epistemic contract — normative (single source)

This file is the **sole authored source** for normative **epistemic contract** prose: what “grounded” verification output means, what the repository can and cannot prove, how that differs from **funnel** or **telemetry** stories, and what operators must not infer. **Do not restate these definitions elsewhere**—downstream docs and the website use **approved pointers** or **generated excerpts** from this file only (see [`config/epistemic-contract-structure.json`](../config/epistemic-contract-structure.json) and `scripts/validate-epistemic-contract-structure.mjs`).

**Operational SSOT** (four-way model, ProductionComplete cohort checklist, commercial validation verdict field semantics, negative validation list) lives in [`adoption-epistemics-ssot.md`](adoption-epistemics-ssot.md)—link there for checklists and verdicts, not for duplicating this contract.

---

> **Production binding** is the earliest provable constraint on **grounded verification output** (read-only SQL vs expectations from integrator-owned structured activity and registry on the integrator’s authoritative database). **Which real-world funnel stage** loses the most integrators is **not inferable from committed repository evidence alone**—that ranking requires time-bounded telemetry and product context outside this repository.

---

## Structural vs empirical (definitions)

Proof split in the four-way model ([`adoption-epistemics-ssot.md`](adoption-epistemics-ssot.md) table) is **structural** (definitions and what CI can exercise). **Where users drop off in production** is **empirical** and requires telemetry and analytics; that evidence is **not** committed in this repository.

## First necessary constraint on grounded output (formal property)

**Property (not a ranked funnel stage):** **Grounded verification throughput**—repeatable contract verification outcomes against the integrator’s authoritative SQLite or Postgres—is **structurally** limited by the **first dependency on integrator-owned, correctly-shaped inputs**: structured tool activity the engine can ingest, a registry that maps `toolId` to SQL expectations, and read-only access to that database. That is the moment the product becomes **epistemically “real”** (observed SQL vs expectations derived from declared activity) and **outside** what this repository can prove without the integrator’s data and credentials.

**What “integrator-owned” excludes (for this property):** Bundled demo fixtures, README-only replay, **PatternComplete** temp paths alone, or telemetry **`workload_class`** alone—see [Integrate spine](first-run-integration.md#integrate-spine-normative) vs [Step 4 / ProductionComplete](first-run-integration.md#step-4-bootstrap-when-you-have-your-own-tool_calls-and-a-db-url). **IntegrateSpineComplete** still uses repository-pinned bootstrap inputs for the final segment; **ProductionComplete** requires **their** events/registry (or bootstrap pack from **their** `tool_calls`) on **their** database per [`first-run-integration.md`](first-run-integration.md).

**What “correctly-shaped” means (pointers only):**

- **Structured tool activity** and ICP limits: [`verification-product-ssot.md`](verification-product-ssot.md) (core promise, exclusions).
- **Event line contract (NDJSON / observation model):** [Event line schema](agentskeptic.md#event-line-schema) in [`agentskeptic.md`](agentskeptic.md).
- **Registry and contract verify path:** [`first-run-integration.md`](first-run-integration.md) (spine and Step 4).

**Relationship to operator metrics:** Rolling rates that include **`workload_class` = `non_bundled`** are a **path heuristic** for “outside bundled example paths,” not proof of ProductionComplete, ICP fit, or user understanding—see [Qualification proxy (operator)](funnel-observability-ssot.md#qualification-proxy-operator) and [`growth-metrics-ssot.md`](growth-metrics-ssot.md).

**Dominant real-world drop-off:** **Which** link in the chain loses the most mass in production (evaluation vs install vs integrate spine vs Step 4 vs paid conversion) **cannot be ranked from this repository**; ranking requires time-bounded telemetry and context outside committed files (same line as **Structural vs empirical** above).

**Examples of what this property subsumes (not ranked facts):** a prospect lacks structured tool exports; a team cannot query the authoritative DB read-only; registry rows drift from schema; integrator stops after demo; spine succeeds but Step 4 on owned inputs never runs.

## Structural vs empirical vs telemetry proxies

Use these terms consistently:

- **First necessary constraint on grounded output / first dependency:** Same property as [First necessary constraint on grounded output (formal property)](#first-necessary-constraint-on-grounded-output-formal-property)—throughput of **grounded** verification cannot exceed integrator-owned, correctly-shaped inputs on authoritative SQL. This is **provable from repository definitions**; it is **not** a claim about which funnel stage loses the most mass in production without operator data.
- **Empirical (dominant) drop-off:** Which stage loses the most integrators **requires** time-bounded telemetry and context outside committed files—see **Dominant real-world drop-off** above and [`growth-metrics-ssot.md`](growth-metrics-ssot.md) (*Ranking dominant funnel loss*).
- **Telemetry L1 (path heuristic):** `workload_class = non_bundled` on activation rows ([`src/commercial/verifyWorkloadClassify.ts`](../src/commercial/verifyWorkloadClassify.ts))—not proof of ProductionComplete (see [Qualification proxy (operator)](funnel-observability-ssot.md#qualification-proxy-operator)).
- **Telemetry L2 (lineage heuristic):** `workflow_lineage = integrator_scoped` on **schema_version 3** activation rows ([`src/funnel/workflowLineageClassify.ts`](../src/funnel/workflowLineageClassify.ts))—excludes shipped catalog workflow ids and **`wf_integrate_spine`**; still **not** human **Decision-ready ProductionComplete** artifacts (A1–A5)—see [`growth-metrics-ssot.md`](growth-metrics-ssot.md) §**CrossSurface_ConversionRate_QualifiedIntegrateToIntegratorScopedVerifyOutcome_Rolling7dUtc**.

---

## Website integrator excerpt (generated)

The following block is **machine-extracted** into `website/src/generated/epistemicContractIntegrator.ts` for the `/integrate` page. **Edit only here**; do not duplicate in `productCopy.ts`.

<!-- epistemic-contract-integrator-snippet:begin -->
Grounded integrator-owned output: run contract verify on your events, registry, and authoritative DB (Step 4 in docs/first-run-integration.md); prefer agentskeptic verify-integrator-owned so shipped example fixture triples are rejected (docs/agentskeptic.md Integrator-owned gate). IntegrateSpineComplete when exit code is 0: you ran the pedagogical demo and AdoptionComplete_PatternComplete mid-script on temp paths, then the final bootstrap plus contract verify on your AGENTSKEPTIC_VERIFY_DB using the fixed pack under examples/integrate-your-db (L0 shell: scripts/templates/integrate-activation-shell.bash). The final verify on your file may not satisfy AC-OPS-03 temp-path rules by design—see docs/first-run-integration.md (Integrate spine). Decision-ready ProductionComplete (artifacts A1–A5 on integrator-owned inputs) is a stronger bar; IntegrateSpineComplete does not substitute. Full epistemic definitions: https://github.com/jwekavanagh/agentskeptic/blob/main/docs/epistemic-contract.md — Decision-ready checklist: https://github.com/jwekavanagh/agentskeptic/blob/main/docs/adoption-epistemics-ssot.md#decision-ready-productioncomplete-normative
<!-- epistemic-contract-integrator-snippet:end -->
