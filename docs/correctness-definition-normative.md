# Correctness definition — normative contract

This document is the **behavioral single source of truth** for `workflowTruthReport.correctnessDefinition` and Quick Verify unit `correctnessDefinition` (same nested shape, `schemaVersion` **1**). Structure is defined in [`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json) (`$defs.correctnessDefinitionV1`). Implementation string templates live in [`src/correctnessDefinitionTemplates.ts`](../src/correctnessDefinitionTemplates.ts); a doc parity test pins template anchors to this file.

## Trust boundary

`correctnessDefinition` is **descriptive**: it states what must hold for verification to succeed. It does **not** instruct the engine to mutate data or run new SQL. Remediation alignment remains hints for humans and downstream policy ([`docs/workflow-verifier.md`](workflow-verifier.md)).

## Minimum contract quality

- **`mustAlwaysHold`:** One line, max length aligned with operational messages. Must start with **`Must:`** (forward modality), name the **obligation bearer** (ingest, capture, run context, database state, or mapping), and must **not** repeat `failureExplanation.observed` or `failureExplanation.divergence` verbatim.
- **`enforceAs`:** At least **two** checklist strings, stable order per `enforcementKind`, derived from the template clauses in this document—not an ad-hoc dump of `knownFacts`.
- **`enforceableProjection`:** Non-null, machine-stable; discriminated by **`projectionKind`** (equals **`enforcementKind`**). Integrators should prefer projection over prose for automation.

## `enforcementKind` and `projectionKind` (closed set)

| Value | When emitted |
|-------|----------------|
| `run_ingest_integrity` | Primary failure scope is `run_level`, or `step` with `NO_STEPS_FOR_WORKFLOW` |
| `event_capture_integrity` | Primary scope is `event_sequence` |
| `run_context_fairness` | Primary scope is `run_context` |
| `step_sql_expectation` | Primary scope is `step` (normal SQL-backed step; not plan-transition workflow) |
| `plan_transition_expectation` | `workflowId === wf_plan_transition` and primary scope is `step` |
| `quick_inferred_sql_row` | Quick Verify unit `kind === "row"`, has inferred `sql_row` request, verdict `fail` or `uncertain` |
| `quick_inferred_relational` | Quick Verify unit `kind === "related_exists"`, verdict `fail` or `uncertain` |
| `quick_mapping_gap` | Quick Verify unit `kind === "row"`, no mappable request, verdict `fail` or `uncertain` |

## Integrator mapping

- **`step_sql_expectation` / `plan_transition_expectation`:** `enforceableProjection.verificationRequest` (or plan-target fields) is **sufficient** to diff or author the corresponding tools-registry expectation and to re-run `verify-workflow` with the same logical check when events and DB are available.
- **`run_ingest_integrity` / `event_capture_integrity`:** `primaryFailureCodes` or `forbiddenEventSequenceCodes` plus `workflowId` and `verificationPolicyFragment` are **sufficient** to build ingest or capture CI gates that reject bad runs **before** verification.
- **`run_context_fairness`:** `ingestIndex`, `requiredUpstreamContract`, and `primaryRunContextCodes` are **sufficient** to document upstream prerequisites for fair tool evaluation.
- **`quick_inferred_sql_row` / `quick_inferred_relational`:** `sqlRowRequest` or relational fields are **sufficient** to build a provisional or exported registry check (subject to Quick Verify coverage limits in [`docs/verification-product-ssot.md`](verification-product-ssot.md)).
- **`quick_mapping_gap`:** Projection is **sufficient** to choose among extending structured tool activity, adding an explicit registry tool, or `manual_review`—see `remediationAlignment`.

## `requiredUpstreamContract` (run context)

Maps from primary run-context code (lexicographic first when multiple):

| Code | `requiredUpstreamContract` |
|------|----------------------------|
| `RETRIEVAL_ERROR` | `retrieval_ok_before_observation` |
| `MODEL_TURN_ERROR`, `MODEL_TURN_ABORTED`, `MODEL_TURN_INCOMPLETE` | `model_turn_completed_before_observation` |
| `CONTROL_INTERRUPT` | `no_interrupt_before_observation` |
| `CONTROL_BRANCH_SKIPPED` | `branch_not_skipped_before_observation` |
| `CONTROL_GATE_SKIPPED` | `gate_not_skipped_before_observation` |
| `TOOL_SKIPPED` | `tool_not_skipped_before_observation` |

## `ingestContractRequirement` (run ingest)

| Situation | Value |
|-----------|--------|
| `NO_STEPS_FOR_WORKFLOW` in primary codes | `non_empty_tool_observed_steps` |
| Otherwise run-level | `no_run_level_failures` |

## Forward templates (by kind) — clause semantics

Implementation fills `<placeholders>` deterministically. Anchors **`CD_TPL_*`** must appear in [`src/correctnessDefinitionTemplates.ts`](../src/correctnessDefinitionTemplates.ts).

### `run_ingest_integrity` — CD_TPL_RUN_INGEST

- **`mustAlwaysHold`:** Must: ingest for workflowId=&lt;workflowId&gt; SHALL deliver a valid captured run under policy [&lt;P&gt;] with no blocking run-level failures (codes: &lt;codes&gt;). When requirement is non_empty_tool_observed_steps, the stream SHALL yield at least one tool_observed step for verification.
- **`enforceAs` [0]:** Ingest pipelines SHALL validate each event line against the wire event contract before verification.
- **`enforceAs` [1]:** CI or preflight SHALL reject captures that surface primary failure codes &lt;codes&gt; for this workflow under the same policy.

### `event_capture_integrity` — CD_TPL_EVENT_CAPTURE

- **`mustAlwaysHold`:** Must: event capture for workflowId=&lt;workflowId&gt; SHALL preserve monotonic, well-formed ordering under policy [&lt;P&gt;] and SHALL NOT emit event-sequence fault codes &lt;codes&gt;.
- **`enforceAs` [0]:** Capture agents SHALL preserve capture-order and timestamp monotonicity rules required for seq-sorted verification.
- **`enforceAs` [1]:** Automated checks SHALL fail runs that include codes &lt;codes&gt; in the event_sequence integrity set.

### `run_context_fairness` — CD_TPL_RUN_CONTEXT

- **`mustAlwaysHold`:** Must: before evaluating the failing tool observation at ingest_index=&lt;I&gt;, upstream run context SHALL satisfy contract &lt;C&gt; under policy [&lt;P&gt;] (primary codes: &lt;codes&gt;).
- **`enforceAs` [0]:** Orchestration SHALL record retrieval, model turns, controls, and tool_skipped events so fairness can be checked at the failing ingest index.
- **`enforceAs` [1]:** Replays SHALL not evaluate downstream tool_observed steps when &lt;C&gt; is violated for that index.

### `step_sql_expectation` — CD_TPL_STEP_SQL

- **`mustAlwaysHold`:** Must: after tool_observed seq=&lt;S&gt; toolId=&lt;T&gt;, database state SHALL satisfy the verification contract in verificationRequest under policy [&lt;P&gt;] for workflowId=&lt;W&gt;.
- **`enforceAs` [0]:** Registry (or synthetic events plus registry) SHALL keep verificationRequest aligned with declared tool parameters for seq=&lt;S&gt;.
- **`enforceAs` [1]:** Authoritative SQL state SHALL match identity, required fields, and relational checks encoded in verificationRequest.

### `plan_transition_expectation` — CD_TPL_PLAN_TRANSITION

- **`mustAlwaysHold`:** Must: plan-validation step seq=&lt;S&gt; toolId=&lt;T&gt; SHALL satisfy declared plan rules under policy [&lt;P&gt;] for workflowId=&lt;W&gt; (primary codes: &lt;codes&gt;).
- **`enforceAs` [0]:** Plan.md rules and git transition inputs SHALL remain aligned with the verification target for this step.
- **`enforceAs` [1]:** CI SHALL re-run plan-transition verification after changing patterns or git refs implicated by this failure.

### `quick_inferred_sql_row` — CD_TPL_QUICK_ROW

- **`mustAlwaysHold`:** Must: when tool &lt;toolName&gt; actionIndex=&lt;A&gt; is treated as successful for quick verification, table &lt;table&gt; SHALL satisfy the inferred sql_row contract (provisional, not a signed export) under read-only SQL checks.
- **`enforceAs` [0]:** Structured tool activity SHALL continue to expose parameters needed to infer identity and required fields for table &lt;table&gt;.
- **`enforceAs` [1]:** For production enforcement, promote this check to contract verification via exported registry and synthetic events when eligible.

### `quick_inferred_relational` — CD_TPL_QUICK_REL

- **`mustAlwaysHold`:** Must: when tool &lt;toolName&gt; actionIndex=&lt;A&gt; is treated as successful, related row existence for childTable=&lt;T&gt; SHALL hold as checked by the inferred related_exists contract (provisional).
- **`enforceAs` [0]:** Foreign-key or pointer fields in structured activity SHALL remain sufficient to infer match columns for &lt;T&gt;.
- **`enforceAs` [1]:** For full contract coverage, add explicit sql_relational tooling in the registry; quick inference does not export all relational rules.

### `quick_mapping_gap` — CD_TPL_QUICK_GAP

- **`mustAlwaysHold`:** Must: either structured tool activity for tool &lt;toolName&gt; actionIndex=&lt;A&gt; SHALL map to an inferrable sql_row check, or you SHALL add an explicit registry-backed expectation—provisional quick verification cannot enforce this action until one path exists (reason codes: &lt;codes&gt;).
- **`enforceAs` [0]:** Extend ingest fields or tool naming so row identity and required columns can be inferred, **or** author a registry tool for this action.
- **`enforceAs` [1]:** Re-run quick verify; then use contract replay for exported row tools to lock the expectation in batch mode.

## `remediationAlignment` (Quick Verify)

Deterministic map from lexicographically first `reasonCodes` entry on the unit:

| Reason prefix / code | `recommendedAction` |
|----------------------|---------------------|
| `CONNECTOR_ERROR` | `improve_read_connectivity` |
| `MAPPING_FAILED`, `UNKNOWN`, registry/resolve style codes | `correct_verification_inputs` |
| `ROW_ABSENT`, `VALUE_MISMATCH`, `DUPLICATE_ROWS`, relational mismatch codes | `reconcile_downstream_state` |
| Else | `manual_review` |

(`automationSafe` is always `false` for quick non-pass units.)

Batch path copies `failureAnalysis.actionableFailure` unchanged.
