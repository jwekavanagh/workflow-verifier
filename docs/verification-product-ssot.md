# Verification product — SSOT (narrative pins & authority)



This document is the **authoritative place** for **product intent**: trust boundary, category, ICP exclusion, core promise, Quick Verify positioning, and **which file owns which contract**. It is **not** a CLI runbook, a UI string catalog, a full reconciliation field matrix, or **reference-path / test-boundary governance**—those live in the documents linked below.



**Operational detail** (first-run commands, integrator stdout/stderr contracts, TTFV validation, export-vs-replay coverage): [`verification-operational-notes.md`](verification-operational-notes.md). **Reconciliation dimension IDs, stderr prefixes, and batch/Quick JSON mapping:** [`reconciliation-vocabulary-ssot.md`](reconciliation-vocabulary-ssot.md). **LangGraph-shaped integrator boundaries** (emitter vs CLI ordering, command provenance): [`langgraph-reference-boundaries-ssot.md`](langgraph-reference-boundaries-ssot.md).



## What this does **not** prove (trust boundary)



Across **Quick Verify** and **contract** verification:



- This does **not** prove that a tool call **actually executed** or that an effect **actually ran**—only that **observed database state** matched **expectations** when checked.

- This does **not** prove that a **change occurred** (or did not occur)—verification is a **snapshot**: current SQL state vs expected state.

- This **only** proves **state matches declared or inferred expectations** under the configured rules—not “execution correctness” or causality.



**Declared vs expected vs observed** (first-class mental model; echoed on stdout as `productTruth.layers` on `QuickVerifyReport`):



1. **Declared** — What structured **tool activity** encodes (tool identity and parameters extracted from ingest).

2. **Expected** — What should hold in SQL: **quick** = **inferred** from declared parameters (provisional); **contract** = **registry-resolved** from events.

3. **Observed** — What **read-only SQL** returned at verification time.



## Product category



You are a **state verification engine for agent-driven systems** that have **SQL ground truth**. You are **not** a logging, tracing, or general observability product, and you are **not** a substitute for tests of application code paths.



## Who should **not** use this (ICP exclusion)



- Teams **without** **structured tool activity** (JSON describing tool calls and parameters)—there is **no** “paste any logs” path.

- Teams **without** **SQL-accessible** authoritative state.

- Teams that need **causal** or **execution** guarantees, not **state–expectation** checks.

- Teams expecting **plug-and-play** ingestion without aligning to the **event / ingest model**.



## Documentation authority matrix



| Subject | Authoritative location | Elsewhere |

|---------|-------------------------|-----------|

| **Buy vs build** (recurring failure mode, limits of ad-hoc SQL checks, **Quick → Contract** graduation narrative) | [`README.md`](../README.md) section **Buy vs build: why not only SQL checks** (after discovery markers, before Try it) | [`docs/golden-path.md`](../docs/golden-path.md) points here first; [`docs/first-run-integration.md`](../docs/first-run-integration.md) links prerequisite only—no duplicate long narrative |

| Ingest ladder L0–L5, `extractActions`, thresholds (`T_TABLE`, …), dedupe, decomposition, rollup, CLI phase ordering, registry bytes, human stderr anchor rules | [`quick-verify-normative.md`](quick-verify-normative.md) | Link only; never copy thresholds or ladder text |

| **Bootstrap pack** CLI (`agentskeptic bootstrap`, `BootstrapPackInput` v1, synthesized Quick ingest, pack artifacts, exit I/O) | [`bootstrap-pack-normative.md`](bootstrap-pack-normative.md), [`schemas/bootstrap-pack-input-v1.schema.json`](../schemas/bootstrap-pack-input-v1.schema.json) | Accepts only versioned JSON (OpenAI-shaped `tool_calls` subset); not “paste any logs.” Product positioning unchanged. |

| **Hosted registry draft** (optional same-origin `POST /api/integrator/registry-draft`, schema pins, AJV order, harness markers, outcome-chain tests) | [`registry-draft-ssot.md`](registry-draft-ssot.md), [`schemas/registry-draft-request-v1.schema.json`](../schemas/registry-draft-request-v1.schema.json), [`schemas/registry-draft-response-v1.schema.json`](../schemas/registry-draft-response-v1.schema.json) | Not verification: model-assisted draft only; trust boundary in [`verification-product-ssot.md`](verification-product-ssot.md) unchanged |

| `QuickVerifyReport` JSON shape (`schemaVersion` **4**, `productTruth`, required `units[].reconciliation`, `units[].correctnessDefinition` on non-pass, …) | [`schemas/quick-verify-report.schema.json`](../schemas/quick-verify-report.schema.json) | Normative doc links schema; no second field catalog |

| **Correctness definition** (forward MUST + `enforceableProjection` on batch truth + quick non-pass units) | [`correctness-definition-normative.md`](correctness-definition-normative.md), [`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json) | Batch human stderr: `correctness_definition:` in [`agentskeptic.md`](agentskeptic.md); trust boundary unchanged |

| User-facing English strings for quick verify (exact wording) | [`src/quickVerify/quickVerifyHumanCopy.ts`](../src/quickVerify/quickVerifyHumanCopy.ts), [`src/quickVerify/formatQuickVerifyHumanReport.ts`](../src/quickVerify/formatQuickVerifyHumanReport.ts) (banner lines), [`src/quickVerify/quickVerifyProductTruth.ts`](../src/quickVerify/quickVerifyProductTruth.ts) (stdout `productTruth`), [`src/verificationUserPhrases.ts`](../src/verificationUserPhrases.ts) (reason `user_meaning`) | Appendix H in normative lists **identifiers** only |

| **Reconciliation vocabulary** (dimension IDs, `<th>` titles, stderr prefixes, batch vs Quick JSON mapping) | [`reconciliation-vocabulary-ssot.md`](reconciliation-vocabulary-ssot.md), [`src/reconciliationPresentation.ts`](../src/reconciliationPresentation.ts) | Do not duplicate strings outside module + tests |

| `verifyWorkflow`, batch CLI, registry resolution, Postgres read-only session, `WorkflowResult` (embedded **`workflowTruthReport.schemaVersion` 9**, required **`observedStateSummary`**) | [`agentskeptic.md`](agentskeptic.md) | Batch semantics; reconciliation table: [`reconciliation-vocabulary-ssot.md`](reconciliation-vocabulary-ssot.md) |

| **Integrator-owned batch gate** (`agentskeptic verify-integrator-owned`, `BUNDLED_PATH_SUFFIXES` gate, telemetry wire `verify_integrator_owned`) | [`agentskeptic.md`](agentskeptic.md) subsection **Integrator-owned gate**; [`src/commercial/verifyWorkloadClassify.ts`](../src/commercial/verifyWorkloadClassify.ts) | [`first-run-integration.md`](first-run-integration.md) grounded path; [`funnel-observability-ssot.md`](funnel-observability-ssot.md) product-activation `subcommand` union |

| **CI enforcement** (`enforce`, `ci-lock-v1`, bootstrap vs expect-lock recipe) | [`ci-enforcement.md`](ci-enforcement.md), [`schemas/ci-lock-v1.schema.json`](../schemas/ci-lock-v1.schema.json), [Enforce stream contract](agentskeptic.md#enforce-stream-contract-normative) in [`agentskeptic.md`](agentskeptic.md) | Lock field list only in schema; streams only in agentskeptic |

| **Commercial free vs paid** (OSS vs published npm, reserve, Starter account) | [`commercial-ssot.md`](commercial-ssot.md) — subsection *Free vs paid boundary (normative v1)* | [`commercial-entitlement-policy.md`](commercial-entitlement-policy.md), [`ci-enforcement.md`](ci-enforcement.md) — recipes and “why” only; do not duplicate the matrix |

| **Assurance** (`assurance run` / `assurance stale`, manifest + run report, staleness) | [Assurance subsystem](agentskeptic.md#assurance-subsystem-normative) in [`agentskeptic.md`](agentskeptic.md), [`schemas/assurance-manifest-v1.schema.json`](../schemas/assurance-manifest-v1.schema.json), [`schemas/assurance-run-report-v1.schema.json`](../schemas/assurance-run-report-v1.schema.json) | Example manifest: [`examples/assurance/manifest.json`](../examples/assurance/manifest.json); scheduled workflow: [`.github/workflows/assurance-scheduled.yml`](../.github/workflows/assurance-scheduled.yml) |

| **Shareable public reports** (`POST /api/public/verification-reports`, `GET /r/{id}`, `--share-report-origin`, envelope schema, operator env **`PUBLIC_VERIFICATION_REPORTS_ENABLED`**) | [`shareable-verification-reports.md`](shareable-verification-reports.md), [`schemas/public-verification-report-v1.schema.json`](../schemas/public-verification-report-v1.schema.json) | CLI exit semantics for share failures: [`agentskeptic.md`](agentskeptic.md); OpenAPI: [`schemas/openapi-commercial-v1.yaml`](../schemas/openapi-commercial-v1.yaml) |

| Repo entry, discovery sync markers, Homepage hero: discovery `heroTitle`, `homepageDecisionFraming`, `heroSubtitle`; acquisition long-form on `/database-truth-vs-traces`; acquisition `llms` demand section | [`README.md`](../README.md) (sync markers only for those fields), [`config/discovery-acquisition.json`](../config/discovery-acquisition.json) (SSOT), [`docs/public-distribution-ssot.md`](public-distribution-ssot.md) | **Buy vs build** narrative is **not** in discovery markers—see row **Buy vs build** above; no algorithm copy; do not duplicate hero strings outside JSON + sync |

| First-run commands, integrator I/O, operator DB posture, TTFV, export vs replay coverage | [`verification-operational-notes.md`](verification-operational-notes.md) | Product SSOT links here; does not replace normative thresholds |

| **AdoptionComplete — PatternComplete vs ProductionComplete** (checklist IDs `AC-TRUST-*` / `AC-OPS-*`, CI-provable path, boundary statement) | [`first-run-integration.md`](first-run-integration.md) section **AdoptionComplete_PatternComplete (normative)** | Elsewhere: pointer-only summaries; do not restate checklist tables outside this section |

| **Decision-ready ProductionComplete** (integrator-retained artifacts A1–A5; pass vs explained mismatch/incomplete) | [`adoption-epistemics-ssot.md`](adoption-epistemics-ssot.md) subsection **Decision-ready ProductionComplete (normative)** | Product copy and integrator docs link the stable GitHub URL fragment; do not duplicate the full contract here |

| **Epistemic contract** (grounded verification output vs funnel dominance; first necessary constraint on grounded output; structural vs empirical vs telemetry proxies; what must not be inferred from committed repo evidence) | [`epistemic-contract.md`](epistemic-contract.md) | Do not restate elsewhere; downstream docs use approved pointer blocks or generated website excerpt only |
| **Adoption epistemics** (four-way proof model: PatternComplete vs IntegrateSpineComplete vs ProductionComplete vs telemetry KPIs; `artifacts/commercial-validation-verdict.json` field `layers.playwrightCommercialE2e`; `COMMERCIAL_REQUIRE_LAYER2`; ProductionComplete cohort checklist; negative validation list) | [`adoption-epistemics-ssot.md`](adoption-epistemics-ssot.md) | Normative definitions: [`epistemic-contract.md`](epistemic-contract.md); [`funnel-observability-ssot.md`](funnel-observability-ssot.md) for HTTP/beacon tables; [`growth-metrics-ssot.md`](growth-metrics-ssot.md) for SQL and metric ids; [`first-run-integration.md`](first-run-integration.md) for integrator commands—do not duplicate four-way table outside adoption epistemics |

| **Funnel epistemics** (user outcome vs telemetry capture; interpreting North Star without over-claim) | [`funnel-observability-ssot.md`](funnel-observability-ssot.md) section **User outcome vs telemetry capture (operator)** | Four-way framing and commercial verdict semantics: [`adoption-epistemics-ssot.md`](adoption-epistemics-ssot.md). Metric definitions and SQL only in [`growth-metrics-ssot.md`](growth-metrics-ssot.md); [`commercial-ssot.md`](commercial-ssot.md) links here—do not duplicate taxonomy |

| **LangGraph reference** (emitter ordering, integrator primacy, partner commands, test chain) | [`langgraph-reference-boundaries-ssot.md`](langgraph-reference-boundaries-ssot.md) | [`examples/langgraph-reference/README.md`](../examples/langgraph-reference/README.md) is prose-only; boundaries matrix lives here |



## Core promise



Given **structured tool activity** (not arbitrary logs) and **read-only SQL** (**SQL ground truth**: SQLite or Postgres you can query), verify that **observed database state matches expectations** derived from that activity and (in contract mode) the registry—not “handle any log” or “infer everything.” API-only or non-SQL systems are **out of scope**.



## Quick Verify positioning



Quick Verify is **provisional**: inference-based mapping, **uncertain** as a normal rollup outcome, and rollup **pass** **must not** be read as production safety or audit-final. Authoritative framing is on every stdout report: **`productTruth`** (`doesNotProve`, `layers`, `quickVerifyProvisional`, `contractReplayPartialCoverage`). Human stderr repeats the same themes in fixed banners after the three anchors.



**Export and contract bridge:** Predicate names, merge rules, eligibility bands, and appendix references for moving inferred work into registry-backed replay live only in [`quick-verify-normative.md`](quick-verify-normative.md) and in operator-oriented summary in [`verification-operational-notes.md`](verification-operational-notes.md)—not re-specified here.



## Contract replay is partial coverage



**Export → replay** verifies **exported tools** in `exportableRegistry.tools` (high-confidence **`sql_row`** entries and eligible **`sql_relational`** / **`related_exists`** exports) against synthetic `tool_observed` NDJSON and the exported registry. It is **not** full-fidelity replay of everything Quick Verify may have inferred (non-exported inferred units, non-eligible **`related_exists`**, and other Advanced checks are not carried by the export). `productTruth.contractReplayPartialCoverage` is **`true`** when at least one tool was exported and at least one inferred unit has `contractEligible: false`. Operators must not treat “I ran quick → replay → verified” as blanket coverage.

