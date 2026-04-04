# Execution Truth Layer (MVP) — Single Source of Truth

This document is the authoritative specification for the MVP. The product verifies **external SQL state** against expectations derived from **observed tool calls** and a **tool registry**, never from agent-reported success alone.

## Why this shape

- **NDJSON events**: One line per tool invocation provides a concrete “observe each step” capture surface that any agent stack can implement by appending JSON after each tool call.
- **Tool registry (`tools.json`)**: Keeps “intent → expected state” inside the product using RFC 6901 JSON Pointers into `params`, so events do not carry caller-supplied expectation blobs.
- **SQLite via `node:sqlite`**: Read-only `SELECT` against a file path gives reproducible ground truth in CI. The reference plan named `better-sqlite3`; this repo uses Node’s built-in module (**Node ≥ 22.13**) to avoid native compilation on constrained environments while preserving the same reconciliation rules as Postgres (see [SQL connector contract](#sql-connector-contract)).
- **Postgres via `pg` (batch/CLI only)**: `verifyWorkflow` can target PostgreSQL using a single `pg.Client` per run, session read-only guards (`applyPostgresVerificationSessionGuards`), then verification `SELECT`s only. The in-process hook does **not** use Postgres (see [Postgres verification (batch and CLI)](#postgres-verification-batch-and-cli)).

## Audiences

### Engineer

| Module | Role |
|--------|------|
| `schemaLoad.ts` | AJV 2020-12 validators for event line, registry, workflow engine/result, truth report, compare-input |
| `failureCatalog.ts` | Stable run-level literals, `formatOperationalMessage`, CLI error envelope helpers, `CLI_OPERATIONAL_CODES` |
| `truthLayerError.ts` | `TruthLayerError` for coded I/O and registry failures |
| `loadEvents.ts` | Read NDJSON, validate, filter `workflowId`; delegate sort + `eventSequenceIntegrity` to `prepareWorkflowEvents` |
| `prepareWorkflowEvents.ts` | Sole ingest `stableSortEventsBySeq`; attaches `eventSequenceIntegrity` |
| `eventSequenceIntegrity.ts` | Pure analysis of capture order vs `seq` and optional `timestamp` monotonicity (seq-sorted order) |
| `planLogicalSteps.ts` | Stable sort, group by `seq`, canonical params equality, divergence vs last observation |
| `resolveExpectation.ts` | Registry + params → `VerificationRequest`; `intendedEffect` template rendering (audit only) |
| `valueVerification.ts` | Canonical display strings + `verificationScalarsEqual` (single scalar comparison table) |
| `sqlConnector.ts` | SQLite parameterized read; lowercase column keys |
| `sqlReadBackend.ts` | `buildSelectByKeySql`, Postgres `SqlReadBackend`, `connectPostgresVerificationClient`, `applyPostgresVerificationSessionGuards` |
| `reconciler.ts` | `reconcileFromRows` (pure rule table), `reconcileSqlRow` (SQLite sync), `reconcileSqlRowAsync` (Postgres) |
| `multiEffectRollup.ts` | `rollupMultiEffectsSync` / `rollupMultiEffectsAsync`: per-effect reconcile, UTF-16 sort by effect `id`, step rollup (`verified` / `partially_verified` / `inconsistent` / `incomplete_verification`) |
| `aggregate.ts` | Workflow status precedence |
| `verificationDiagnostics.ts` | Pinned step `failureDiagnostic`; `formatVerificationTargetSummary`; run/event-sequence `category:` helpers for human report (internal; not re-exported from package entry) |
| `workflowTruthReport.ts` | `buildWorkflowTruthReport`, `finalizeEmittedWorkflowResult`, `formatWorkflowTruthReportStruct`, `formatWorkflowTruthReport`, `STEP_STATUS_TRUTH_LABELS`, `TRUST_LINE_EVENT_SEQUENCE_IRREGULAR_SUFFIX`; human report is rendering of structured truth |
| `workflowResultNormalize.ts` | `normalizeToEmittedWorkflowResult`, `workflowEngineResultFromEmitted` (compare v5/v6 inputs) |
| `runComparison.ts` | `buildRunComparisonReport`, `formatRunComparisonReport`, `logicalStepKeyFromStep`, `recurrenceSignature`; cross-run comparison |
| `verificationPolicy.ts` | `VerificationPolicy` normalization/validation; `executeVerificationWithPolicySync` / `executeVerificationWithPolicyAsync` (strong vs eventual polling); `createSqlitePolicyContext` |
| `pipeline.ts` | Orchestration: `runLogicalStepsVerification` (internal), async `verifyWorkflow`, sync `verifyToolObservedStep`, `withWorkflowVerification` (SQLite `dbPath` only); default `truthReport` / `logStep` |
| `cli.ts` | CLI entry: legacy verify + `compare` subcommand |

### Engineer note: shared step core

`reconcileFromRows` in `reconciler.ts` is the single rule table. `planLogicalSteps` collapses multiple observations per `seq`; `verifyToolObservedStep` (SQLite, sync) reconciles the **last** observation per logical step when observations are non-divergent. `verifyWorkflow` and `withWorkflowVerification` both call the same internal `runLogicalStepsVerification` once per run (SQLite sync / Postgres async). **Why:** One classification table; one logical step per `seq`; SQLite stays synchronous at the integrator boundary; Postgres stays on the batch path only.

### Low-friction integration (in-process)

Primary integration for running workflows in code: **`await withWorkflowVerification(options, run)`** from `pipeline.ts` (re-exported in the package entry). The `run` callback receives **`observeStep`**; call it after each tool with one [event line](#event-line-schema) object. There is **no** public `finish` — after `run` completes successfully, the library builds the **`WorkflowResult`** (including SQL verification) **before** closing the read-only SQLite handle in **`finally`**.

**`withWorkflowVerification` is SQLite-only** (option `dbPath` → read-only file) and supports **`consistencyMode: "strong"` only**. Eventual consistency polling requires the batch/async path: use **`await verifyWorkflow`** (or CLI) with `verificationPolicy.consistencyMode: "eventual"`. Passing eventual policy to `withWorkflowVerification` fails before the user `run` with operational code **`EVENTUAL_MODE_NOT_SUPPORTED_IN_PROCESS_HOOK`**. For Postgres ground truth, replay NDJSON and call **`await verifyWorkflow`** with `database: { kind: "postgres", connectionString }` or use the CLI (`--postgres-url`). **Why:** Keeps `observeStep` synchronous and a single stable hook; async `pg` and polling are isolated to batch verification.

One root boundary; library owns DB close in finally; avoids silent leaks when integrators omit a terminal call.

Normative contracts:

- **`observeStep` input:** Only a JavaScript **non-null object** is schema-validated against the event schema; **strings and primitives are not parsed as NDJSON**—non-objects yield **`MALFORMED_EVENT_LINE`** (same run-level meaning as a bad NDJSON line in batch mode).
- **`observeStep` return:** Always **`undefined`**. The authoritative step list and statuses are **only** on the fulfilled **`WorkflowResult`** from **`withWorkflowVerification`**.
- **`withWorkflowVerification` return:** **`Promise<WorkflowResult>`** fulfilled on success; **rejected** on invalid registry/DB setup (before `run`) or if **`run`** throws or rejects — the DB is closed in **`finally`** after the result is built (or after throw).
- **Post-close `observeStep`:** If a caller keeps the injected function and uses it after the run, it throws **`Error`** with message **`Workflow verification observeStep invoked after workflow run completed`**.
- **Parity:** Feeding the same event objects in file order as an NDJSON workflow must match **`await verifyWorkflow`** on that file for the same `workflowId`, `registryPath`, and SQLite `database: { kind: "sqlite", path }` (same file path as `dbPath` for the hook).

**Defaults (`truthReport` / `logStep`):** **`withWorkflowVerification`** uses the same defaults as **`verifyWorkflow`**: **`truthReport`** writes the canonical human report (see [Human truth report](#human-truth-report)) to **stderr** once when the `WorkflowResult` is ready; **`logStep`** default is a **no-op** (no per-step stderr JSON). Override with `truthReport: () => {}` in tests. **Migration:** if you depended on previous default per-step JSON on stderr, pass an explicit `logStep`, e.g. `(obj) => console.error(JSON.stringify(obj))`. For custom UIs while keeping canonical copy: `import { formatWorkflowTruthReport } from '<package>'`. **Migration:** `verifyWorkflow` is **async** and takes **`database`** instead of `dbPath`; use `database: { kind: "sqlite", path }` for file-backed batch verification.

### Postgres verification (batch and CLI)

- **Library:** `await verifyWorkflow({ workflowId, eventsPath, registryPath, database: { kind: "postgres", connectionString }, … })`. One **`pg.Client`** per invocation: `connect()` → **`applyPostgresVerificationSessionGuards`** (runs **`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`**) → **`SELECT 1`** on that client → per-step parameterized verification `SELECT`s → `client.end()` in `finally` (cleanup errors must not mask the primary failure).
- **CLI:** Exactly one of `--db <sqlitePath>` or **`--postgres-url <url>`**. Connection, guard, or I/O failure before a verdict: the CLI prints **one line** of JSON to **stderr** (see [CLI operational errors](#cli-operational-errors)) and exits **3** with **no** workflow JSON on stdout.
- **Safety evidence in CI:** Tests assert (1) after session guards, **`INSERT` into `readonly_probe`** fails with **read-only transaction** (`25006`), and (2) role **`verifier_ro`** has **SELECT only** on verification tables (`INSERT` denied `42501`). Operators should still use a **least-privilege DB user** and TLS (`sslmode` in the URL) in real environments.

### Batch and CLI (replay)

For CI, audits, or logs written as NDJSON:

1. To verify your checkout with bundled `examples/` artifacts, run `npm run first-run` from the repository root (see [Examples](#examples)). It builds the project, creates `examples/demo.db` from `seed.sql`, and runs two sample workflows.
2. After **each** tool call, append one JSON object line to your NDJSON file (see [Event line schema](#event-line-schema)).
3. Maintain `tools.json` with one entry per `toolId` your workflows emit.
4. Optionally validate the registry (and optionally resolution vs NDJSON) without a database: `node dist/cli.js validate-registry --registry <path>` or with `--events` and `--workflow-id` (see [Registry validation (`validate-registry`) — normative](#registry-validation-validate-registry--normative)).
5. Run:

```bash
npm run build
node dist/cli.js --workflow-id <id> --events <path> --registry <path> --db <sqlitePath>
# or
node dist/cli.js --workflow-id <id> --events <path> --registry <path> --postgres-url <postgresql-url>
```

**Why:** Same event contract for CI and external logs without requiring in-process wrapper.

**Exit codes**

| Code | Meaning |
|------|---------|
| 0 | `workflow.status` is `complete` |
| 1 | `workflow.status` is `inconsistent` |
| 2 | `workflow.status` is `incomplete` |
| 3 | Operational failure (registry read/parse, events read, DB open/connect, invalid args, internal CLI error); see [CLI operational errors](#cli-operational-errors) |

**`--help` / `-h`:** Prints usage to **stdout** and exits **0** (not a verification run).

**I/O order (CLI — verdict paths 0/1/2):** **`verifyWorkflow`** emits the human report via default **`truthReport`** to **stderr** first, then the CLI writes **stdout**. So: **stderr (human) → stdout (JSON)**. If the CLI is invoked with **`--no-truth-report`**, the CLI passes a no-op **`truthReport`** into **`verifyWorkflow`**: for exits **0–2**, **stderr** is **empty** (no human report); **stdout** is unchanged (still one **`WorkflowResult`** JSON line). Exit **3** is unchanged (see [CLI operational errors](#cli-operational-errors)).

**stdout:** Single JSON object matching `schemas/workflow-result.schema.json` (`schemaVersion` **`6`**; required **`workflowTruthReport`** subtree validated by [`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json) — **SSOT** for structured truth JSON; required **`verificationPolicy`** `{ consistencyMode, verificationWindowMs, pollIntervalMs }`; required **`eventSequenceIntegrity`**; includes required **`runLevelReasons`** alongside **`runLevelCodes`**; each step includes **`repeatObservationCount`** and **`evaluatedObservationOrdinal`**; each non-**`verified`** step includes required **`failureDiagnostic`** — see [Verification diagnostics](#verification-diagnostics-normative)). The aggregated engine shape before finalization is `schemas/workflow-engine-result.schema.json` (`schemaVersion` **5**); see [Structured workflow truth report](#structured-workflow-truth-report-normative).

**Verification policy (CLI):** Default is **`strong`** (single read per check). For **`eventual`**, pass **`--consistency eventual`** plus required **`--verification-window-ms`** and **`--poll-interval-ms`** (integers ≥ 1, **`pollIntervalMs` ≤ `verificationWindowMs`**). With **`strong`**, do not pass the millisecond flags. See [Verification policy (normative)](#verification-policy-normative).

**stderr (verdict paths):** Unless **`--no-truth-report`** is set, one **human truth report** per verification (same text as `formatWorkflowTruthReport`); see [Human truth report](#human-truth-report).

### CI workflow truth contract (Postgres CLI)

This subsection is **normative** for CI and for any automation that treats **`verify-workflow`** as the sole machine-facing verification surface. The **only** structured artifacts for workflow truth from the CLI are:

- **Exits 0–2:** one JSON object on **stdout** matching **`schemas/workflow-result.schema.json`** (see **stdout** above).
- **Exit 3:** **stdout** empty; **stderr** exactly one JSON line with **`kind`:** **`execution_truth_layer_error`** (see [CLI operational errors](#cli-operational-errors)).

There is **no** separate CI-only report format. Integrators should parse **stdout** for verdicts **0–2** and **stderr** for exit **3**, not the human truth report text.

**Environment:** **`POSTGRES_VERIFICATION_URL`** must be set to a **`verifier_ro`**-capable URL after **`scripts/pg-ci-init.mjs`** (or equivalent) has created roles and seeded tables. **`examples/events.ndjson`** and **`examples/tools.json`** are the event and registry paths.

**`--no-truth-report`:** For the cases below that verify exits **0** and **1**, the CLI **must** be invoked with **`--no-truth-report`** so **stderr** is **empty** and automation does not need to skip human lines.

**Case 1 — Postgres happy path (exit 0)**

| Observable | Required |
|------------|----------|
| argv | `--workflow-id wf_complete --events <examples/events.ndjson> --registry <examples/tools.json> --postgres-url <POSTGRES_VERIFICATION_URL> --no-truth-report` |
| Exit code | **0** |
| **stdout** | One line; valid **`WorkflowResult`**; **`schemaVersion`** **6**; required **`workflowTruthReport`**; **`workflowId`** **`wf_complete`**; **`status`** **`complete`**; first step **`status`** **`verified`**; **`runLevelReasons`** **`[]`**; **`runLevelCodes`** **`[]`** |
| **stderr** | Empty |

**Case 2 — Postgres determinate failure (exit 1)**

| Observable | Required |
|------------|----------|
| argv | Same as case 1 with **`--workflow-id wf_missing`** |
| Exit code | **1** |
| **stdout** | One line; valid **`WorkflowResult`**; **`workflowId`** **`wf_missing`**; **`status`** **`inconsistent`**; first step **`status`** **`missing`**; first step first reason **`code`** **`ROW_ABSENT`** |
| **stderr** | Empty |

**Case 3 — Operational failure before verification (exit 3)**

| Observable | Required |
|------------|----------|
| argv | **`--workflow-id wf_complete`** only (omit **`--events`**, **`--registry`**, **`--db`**, **`--postgres-url`**) |
| Exit code | **3** |
| **stdout** | Empty |
| **stderr** | One line; JSON with **`kind`** **`execution_truth_layer_error`**, **`code`** **`CLI_USAGE`**, **`message`** non-empty string length ≤ **2048** |

**Enforcement:** **`test/ci-workflow-truth-postgres-contract.test.mjs`** implements these three cases; **`npm run test:workflow-truth-contract`** runs that file alone. GitHub Actions runs that script in a dedicated step after **`npm run test:node`**.

### CLI operational errors

When the CLI exits **3**, **stderr** is exactly **one** UTF-8 line: a JSON object with:

- `schemaVersion`: **1**
- `kind`: **`execution_truth_layer_error`**
- `code`: one of **`CLI_USAGE`**, **`REGISTRY_READ_FAILED`**, **`REGISTRY_JSON_SYNTAX`**, **`REGISTRY_SCHEMA_INVALID`**, **`REGISTRY_DUPLICATE_TOOL_ID`**, **`EVENTS_READ_FAILED`**, **`SQLITE_DATABASE_OPEN_FAILED`**, **`POSTGRES_CLIENT_SETUP_FAILED`**, **`WORKFLOW_RESULT_SCHEMA_INVALID`**, **`VERIFICATION_POLICY_INVALID`**, **`VALIDATE_REGISTRY_USAGE`**, **`INTERNAL_ERROR`**, plus compare-subcommand codes (**`COMPARE_USAGE`**, **`COMPARE_INPUT_READ_FAILED`**, **`COMPARE_WORKFLOW_TRUTH_MISMATCH`**, …) as documented under [Cross-run comparison](#cross-run-comparison-normative)
- `message`: human-readable text after whitespace normalization and truncation (max **2048** JavaScript string length; see `formatOperationalMessage` in `failureCatalog.ts`)

**stdout** must be empty on exit **3**. Automation should key on **`code`**, not exact **`message`**, for driver-dependent errors.

### Human truth report

This section is **normative**: literals and line shape match `formatWorkflowTruthReportStruct` applied to `buildWorkflowTruthReport(engine)` in `workflowTruthReport.ts` and the contract tests.

**Why this shape**

- **Structured SSOT, one human rendering:** The canonical machine shape is **`workflowTruthReport`** on emitted **`WorkflowResult`** (see [Structured workflow truth report](#structured-workflow-truth-report-normative)). CLI, `verifyWorkflow`, and `withWorkflowVerification` write the human report via optional **`truthReport?: (report: string) => void`**; the default appends one newline after the string to **stderr** (`process.stderr.write`). Same text surfaces—no parallel logic.
- **stderr human / stdout JSON:** Automation keeps a single JSON record on stdout (`jq`, pipes); operators read the verdict on stderr. The CLI flag **`--no-truth-report`** yields empty stderr on verdict exits **0–2** so logs and parsers need not skip the human report (see [Batch and CLI (replay)](#batch-and-cli-replay)).
- **Default `truthReport` to stderr:** Gives a clear truth signal without extra configuration; silent tests pass `truthReport: () => {}`.
- **Default `logStep` no-op:** Removes the old default of one JSON object per step on stderr, which duplicated `WorkflowResult` and conflicted with the human report.
- **Fixed `trust:` lines and step labels (`STEP_STATUS_TRUTH_LABELS`):** Stable strings for alerts, screenshots, and training; most `trust:` lines map to one `WorkflowStatus` from `aggregate.ts`, except the **eventual-window uncertainty** line which applies when `workflow_status` is `incomplete` under the narrow rule in the grammar below.
- **Run-level lines:** Each line uses **`runLevelReasons`** from the engine payload / emitted `WorkflowResult`: `code` + `message` from each `Reason` (same literals as `failureCatalog.ts` for catalog-defined codes).
- **No trailing newline inside the returned string:** The default `truthReport` implementation appends `\n` when writing to stderr.

### Structured workflow truth report (normative)

- **SSOT for JSON shape:** [`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json) (`$id` in file). Integrators and tools should treat that schema as the authoritative contract for **`workflowTruthReport`**; this document describes purpose and integration only (no duplicate field tables here).
- **Embedding:** On stdout / public API, **`workflowTruthReport`** is required on **`WorkflowResult`** with **`schemaVersion` 6** ([`schemas/workflow-result.schema.json`](../schemas/workflow-result.schema.json)).
- **Construction:** `buildWorkflowTruthReport(engine)` derives the object from **`WorkflowEngineResult`** (`schemaVersion` 5, [`schemas/workflow-engine-result.schema.json`](../schemas/workflow-engine-result.schema.json)) produced by `aggregateWorkflow`. `finalizeEmittedWorkflowResult` attaches it and sets **`schemaVersion` 6**.
- **Evolution:** Additive changes to the truth report require bumping **`workflowTruthReport.schemaVersion`** inside the truth schema; breaking engine/stdout shape bumps **`WorkflowResult.schemaVersion`**; document changes in this file’s compatibility section.

## Verification diagnostics (normative)

**Why:** Operators need a stable three-way distinction (workflow execution vs verification setup vs observation uncertainty) without parsing free-text `reason` lines alone.

**JSON (`WorkflowResult.steps[]`):** For each step with **`status !== "verified"`**, **`failureDiagnostic`** is **required** and is one of:

| Value | Meaning |
|-------|--------|
| `workflow_execution` | Determinate mismatch against readable DB state, divergent retries for the same `seq`, or partial multi-effect failure. |
| `verification_setup` | Cannot reliably run or interpret the check (registry resolution, unknown tool in registry, connector errors, row shape unreadable, multi-effect incomplete rollup). |
| `observation_uncertainty` | Eventual consistency: step status **`uncertain`**. |

**Verified steps** must **omit** **`failureDiagnostic`** (schema forbids the property).

**Classification** is implemented in **`verificationDiagnostics.ts`** (`failureDiagnosticForStep`): `incomplete_verification` reasons are mapped in fixed precedence (e.g. **`RETRY_OBSERVATIONS_DIVERGE`** → `workflow_execution`; **`MULTI_EFFECT_INCOMPLETE`** → `verification_setup`; registry/resolve and reconciler incomplete codes → `verification_setup`).

**Human report (`category:`):** After each run-level reason line and each irregular `event_sequence` reason line, one line `    category: ` + the same string as above (`workflow_execution` for all current SSOT run-level and event-sequence codes). For each step with **`status !== "verified"`**, after **`observations:`**, one line `    category: ` + that step’s **`failureDiagnostic`**. When **`formatVerificationTargetSummary`** returns non-null, the next line is `    verify_target: ` + that one-line summary (table/key and required field names; truncated like operational messages).

**Migration from schema v4/v5:** Bump consumers to **`schemaVersion` 6**; read required **`workflowTruthReport`** for stable step labels and trust summary; for each step, if **`status !== "verified"`**, read **`failureDiagnostic`**. Saved **`schemaVersion` 5** files remain valid **`verify-workflow compare`** inputs (normalized in memory).

**Grammar (UTF-8; lines separated by `\n` only; returned string has no trailing `\n`)**

1. **Header — exactly three lines**
   - `workflow_id: ` + workflow id (defensive: replace `\r`/`\n` in the id with `_`).
   - `workflow_status: ` + exactly `complete`, `incomplete`, or `inconsistent`.
   - `trust: ` + exactly one of:
     - `TRUSTED: Every step matched the database under the configured verification rules.` when status is `complete`.
     - `NOT TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.` when status is `incomplete`, **except** when the narrower rule below applies.
     - `NOT TRUSTED: At least one step could not be confirmed within the verification window (row not observed; replication or processing delay is possible).` when status is `incomplete`, **`runLevelReasons` is empty**, at least one step has **`uncertain`**, and **no** step has status in **`{ missing, inconsistent, partially_verified, incomplete_verification }`**.
     - `NOT TRUSTED: At least one step failed verification against the database (determinate failure).` when status is `inconsistent`.
     - When **`eventSequenceIntegrity.kind`** is **`irregular`**, append **exactly** one ASCII space and this exact suffix to the trust sentence chosen above: `Event capture or timestamps were irregular; verification used seq-sorted order. See event_sequence below.` (same string as **`TRUST_LINE_EVENT_SEQUENCE_IRREGULAR_SUFFIX`** in `workflowTruthReport.ts`).

2. **Run-level**
   - If `runLevelReasons` is empty: line exactly `run_level: (none)`.
   - Otherwise: line `run_level:` then for each entry in **`runLevelReasons`** order: line `  - ` + `reason.code` + `: ` + `reason.message` (trimmed), then line `    category: ` + `workflow_execution` (four spaces before `category:`).
   - `runLevelCodes[i]` always equals `runLevelReasons[i].code` (derived from `runLevelReasons` at aggregation). When there are no matching events for the workflow id, the library appends **`NO_STEPS_FOR_WORKFLOW`** with message `No tool_observed events for this workflow id after filtering.`
   - Catalog literal for **`MALFORMED_EVENT_LINE`**: `Event line was missing, invalid JSON, or failed schema validation for a tool observation.`

3. **Event sequence integrity**
   - Immediately after the **run-level** block: if **`eventSequenceIntegrity.kind`** is **`normal`**, line exactly `event_sequence: normal`.
   - If **`kind`** is **`irregular`**: line `event_sequence: irregular`, then for each entry in **`eventSequenceIntegrity.reasons`** in array order: line `  - ` + `reason.code` + `: ` + `reason.message` (trimmed), then line `    category: ` + `workflow_execution`.
   - **Codes and messages** for these reasons are defined in **`EVENT_SEQUENCE_MESSAGES`** and **`eventSequenceTimestampNotMonotonicReason`** in `failureCatalog.ts` (SSOT for wire `message` strings).

4. **Steps**
   - Line exactly `steps:`.
   - For each step in array order: one line `  - seq=` + decimal seq + ` tool=` + toolId + ` status=` + label, where label is from **`STEP_STATUS_TRUTH_LABELS`** (defensive: `\r`/`\n` in toolId → `_`). Status → label mapping:

| Step status | Label |
|-------------|--------|
| `verified` | `VERIFIED` |
| `missing` | `FAILED_ROW_MISSING` |
| `inconsistent` | `FAILED_VALUE_MISMATCH` |
| `incomplete_verification` | `INCOMPLETE_CANNOT_VERIFY` |
| `partially_verified` | `PARTIALLY_VERIFIED` |
| `uncertain` | `UNCERTAIN_NOT_OBSERVED_WITHIN_WINDOW` |

   - Immediately after that header line: exactly one line `    observations: evaluated=` + decimal `evaluatedObservationOrdinal` + ` of ` + decimal `repeatObservationCount` + ` in_capture_order` (four spaces before `observations:`; no trailing spaces; no period).
   - If **`status !== "verified"`**: next line `    category: ` + that step’s **`failureDiagnostic`** (must match JSON). If a non-null verification target summary is defined for the step’s **`verificationRequest`**, the following line is `    verify_target: ` + that summary; otherwise no `verify_target:` line.
   - For each reason: `    reason: [` + code + `] ` + trimmed message, or `(no message)` if the message is empty after trim; if `field` is set and non-empty, append ` field=` + field value.
   - If `intendedEffect` is non-empty after trim: `    intended: ` + single-line text (each `\r`/`\n` replaced by ASCII space, runs of spaces collapsed, trimmed).
   - **Multi-effect steps:** when `evidenceSummary.effects` is present (see [Workflow result: multi-effect shape](#workflow-result-multi-effect-shape)), after `intended:` (if any), emit one line per effect in **UTF-16 lexicographic order of effect `id`** (same comparator as `canonicalJsonForParams` object keys): `    effect: id=` + id + ` status=` + per-effect label, where per-effect labels use the same mapping as the table above **except** `partially_verified` does not appear at the effect level. For each effect with non-empty `reasons`, emit `      reason: [` + code + `] ` + message (six spaces before `reason:`), with optional ` field=` as for step-level reasons.

**Engineer note:** Any change to fixed sentences or labels requires updating golden tests and `test/docs-contract.test.mjs` pins.

### Operator

- **Reading logs:** Treat **stderr** as the human verdict for a verification run; **stdout** (CLI) is the machine-readable `WorkflowResult`. Correlate them by process / timestamp in your log stack.
- **`trust:` line:** Treat as **trusted** only when it is the `TRUSTED:` sentence **and** `workflow_status: complete`. Any line starting with `NOT TRUSTED:` means the workflow must not be treated as fully verified—investigate `steps:`, `run_level:`, and **`event_sequence:`**.
- **Exit codes:** 0 = `complete`, 1 = `inconsistent`, 2 = `incomplete`, 3 = operational failure ([CLI operational errors](#cli-operational-errors)); **`--help`** exits **0**.
- DB user should be **read-only** in production (Postgres: **SELECT-only** role; the product also sets **session read-only** via `applyPostgresVerificationSessionGuards`).
- **`npm test`** requires Postgres 16+ and env **`POSTGRES_ADMIN_URL`** (superuser, runs [`scripts/pg-ci-init.mjs`](../scripts/pg-ci-init.mjs)) and **`POSTGRES_VERIFICATION_URL`** (role `verifier_ro` / SELECT-only on seeded tables). CI sets both; locally use the README Docker one-liner and export the same URLs.
- SQLite file must exist when `readOnly: true` is used (Node `DatabaseSync`).
- Redact secrets from `params` before writing events if logs are retained; **redact params in retained logs** when those logs leave the trust boundary. The human report can include **`intended:`** text from the registry template—apply the same redaction policy if that text can contain secrets.

## Event capture order and delayed delivery (normative)

- **Capture order (batch):** Order of successfully parsed, schema-valid NDJSON lines for a given `workflowId` after filtering. Malformed lines do not produce events and do not consume a capture slot (they still emit **`MALFORMED_EVENT_LINE`** on `runLevelReasons`).
- **Capture order (in-process):** Order of **`observeStep`** calls that enqueue an event for the session `workflowId`.
- **Planning order:** Always **`stableSortEventsBySeq`** (stable by `seq`, ties by capture order). Only **`prepareWorkflowEvents.ts`** performs this sort on ingest; `planLogicalSteps` may sort again (idempotent).
- **`timestamp`:** Optional on events; **never** used to sort events or to choose the evaluated observation per `seq` (still the last observation in capture order within each `seq`).
- **Delayed / out-of-order (in scope):** Events may arrive with `seq` not non-decreasing in capture order, or late in wall time, as long as they are present **before** verification runs (**end of NDJSON read** or **`buildWorkflowResult`** after `run` completes). The product is deterministic: same multiset + capture order → same `WorkflowResult` except **`eventSequenceIntegrity`** per its rules.
- **Out of scope:** Events after **`buildWorkflowResult`** / closed session (**`observeStep`** throws); cross-invocation queuing; mid-run partial verification; SQL timing beyond **`VerificationPolicy`**.

Reason codes for **`eventSequenceIntegrity`** (wire **`message`** strings) are SSOT in **`failureCatalog.ts`** (`EVENT_SEQUENCE_MESSAGES`, **`eventSequenceTimestampNotMonotonicReason`**). JSON shape is SSOT in **`schemas/workflow-result.schema.json`**. Human report templates for **`event_sequence:`** and the irregular **`trust:`** suffix are SSOT in this section and **`workflowTruthReport.ts`**.

## Event line schema

File: [`schemas/event.schema.json`](../schemas/event.schema.json).

Required fields per line:

- `schemaVersion`: `1`
- `workflowId`, `seq` (non-negative integer, monotonic per workflow in normal operation)
- `type`: `tool_observed`
- `toolId`, `params` (object)

**Not allowed on the event (MVP):** `expectation` / `verification` objects — the resolver must derive verification from the registry.

### Retry and repeated seq

Multiple event lines with the same `workflowId` and **`seq`** are treated as **retries** of one logical step. **Capture order** is: after stable sort by `seq`, ties keep **file line order** (batch) or **`observeStep` call order** (session). The **last** observation in that order is the one reconciled against SQL when all observations in the group **match** the last on `toolId` and **canonical params** (see below). If any observation differs from the last, the step is **`incomplete_verification`** / **`RETRY_OBSERVATIONS_DIVERGE`** and **no** SQL reconcile runs for that step.

**`canonicalJsonForParams(value)`** (used only for divergence; implemented in `planLogicalSteps.ts`):

- `null`, `boolean`, `number`, or `string`: `JSON.stringify(value)` per ECMAScript.
- Array: `[` + elements each passed through `canonicalJsonForParams`, joined by `,` + `]` (no spaces).
- Plain object (`typeof === "object"`, not array, not null): own enumerable string keys sorted by UTF-16 code unit order with comparator `(a, b) => (a < b ? -1 : a > b ? 1 : 0)`; `{` + for each key: `JSON.stringify(key)` + `:` + `canonicalJsonForParams(value[key])`, joined by `,` + `}` (no spaces).
- Any other value: sentinel `"__non_json_params:" + typeof value + "__"` (never equal to normal JSON-derived strings).

Two observations **match** iff `toolId` is `===` and `canonicalJsonForParams(params_a) === canonicalJsonForParams(params_b)`.

## Tool registry

File: [`schemas/tools-registry.schema.json`](../schemas/tools-registry.schema.json).

Each entry:

- `toolId` (unique)
- `effectDescriptionTemplate`: string with `{/json/pointer}` tokens → replaced with `JSON.stringify(value)` or `MISSING` (audit string only; **not** used for reconciliation).
- `verification`: either
  - `{ "kind": "sql_row", "table", "key", "requiredFields" }` (same pointer/const rules as before), or
  - `{ "kind": "sql_effects", "effects": [ … ] }` with **at least two** items. Each item has **`id`** (non-empty string, unique within the array) plus the same `table` / `key` / `requiredFields` shape as a `sql_row` entry (no nested `kind` on the item).

**Resolved internal row shape** (one keyed `SELECT` per effect):

```json
{
  "kind": "sql_row",
  "table": "string",
  "keyColumn": "string",
  "keyValue": "string",
  "requiredFields": { "col": "string | number | boolean | null }
}
```

`requiredFields` values must be **string, number, boolean, or null** (JSON scalars at the pointer). Empty object = **presence-only** (row must exist).

**Multi-effect resolution:** each effect is resolved independently; effect **`id`** values are sorted by UTF-16 code unit order before reconciliation output is built. Duplicate **`id`** in the registry → resolver error `DUPLICATE_EFFECT_ID`.

### Resolver error codes → step `incomplete_verification`

| Code | Meaning |
|------|---------|
| `UNKNOWN_TOOL` | `toolId` not in registry |
| `CONST_STRING_EMPTY` | `const` string spec empty or not a string |
| `STRING_SPEC_POINTER_MISSING` | Pointer missing or null |
| `STRING_SPEC_TYPE` | Value at pointer is not a string |
| `STRING_SPEC_EMPTY` | Empty string at pointer |
| `KEY_VALUE_POINTER_MISSING` | Key value pointer missing or null |
| `KEY_VALUE_NOT_SCALAR` | Key value is object/array |
| `KEY_VALUE_SPEC_INVALID` | Key value spec shape invalid |
| `UNSUPPORTED_VERIFICATION_KIND` | Verification kind is not `sql_row` |
| `TABLE_SPEC_INVALID` | Table spec shape invalid |
| `TABLE_POINTER_INVALID` | Table pointer did not resolve to a non-empty string |
| `REQUIRED_FIELDS_POINTER_MISSING` | `requiredFields` pointer missing or null |
| `REQUIRED_FIELDS_NOT_OBJECT` | `requiredFields` not a plain object |
| `REQUIRED_FIELDS_VALUE_UNDEFINED` | Field value is `undefined` |
| `REQUIRED_FIELDS_VALUE_NOT_SCALAR` | Field value is object/array or unsupported type |
| `INVALID_IDENTIFIER` | Table / column / `requiredFields` key not matching `^[a-zA-Z_][a-zA-Z0-9_]*$` |
| `DUPLICATE_EFFECT_ID` | Same `id` twice in `sql_effects.effects` |

Resolver messages for `sql_effects` prefix per-effect failures with `effects[<id>].` (e.g. `effects[primary].requiredFields …`).

**Authoring templates:** Copy-paste starting points live under [`examples/templates/`](../examples/templates/) (`sql_row` and `sql_effects` examples); they must validate against `tools-registry.schema.json`.

## Registry validation (`validate-registry`) — normative

This section is the **single normative contract** for registry validation. The machine shape is [`schemas/registry-validation-result.schema.json`](../schemas/registry-validation-result.schema.json). [README.md](../README.md) may repeat one example command only and must link here.

### Purpose

Validate a **`tools.json`** registry **without** opening SQLite or Postgres: JSON Schema, duplicate `toolId`, duplicate `sql_effects` effect `id` (within each tool), and—when event files are supplied—resolver checks (`resolveVerificationRequest`) against replayed observations (same logical-step and last-observation rules as batch verification).

### CLI

```text
verify-workflow validate-registry --registry <path>
verify-workflow validate-registry --registry <path> --events <path> --workflow-id <id>
```

- **`--registry`**: required.
- **`--events`** and **`--workflow-id`**: **both** or **neither**. Mismatch → exit **3**, code **`VALIDATE_REGISTRY_USAGE`**.
- Unknown options or stray positional arguments → exit **3**, **`VALIDATE_REGISTRY_USAGE`**.
- **`--help` / `-h`**: usage on **stdout**, exit **0** (handled only when `validate-registry` is the first argument; see `cli.ts`).

### Exit codes and I/O

| Exit | stdout | stderr |
|------|--------|--------|
| **0** | Exactly one UTF-8 JSON object: `RegistryValidationResult` matching `registry-validation-result.schema.json`, with **`valid`: `true`** | **Empty** (zero bytes) |
| **1** | Same schema; **`valid`: `false`** | Multi-line UTF-8 human report (grammar below) |
| **3** | **Empty** (zero bytes) | Exactly **one** line: `execution_truth_layer_error` JSON envelope (same shape as [CLI operational errors](#cli-operational-errors)) |

Codes for exit **3** on this subcommand include **`REGISTRY_READ_FAILED`**, **`REGISTRY_JSON_SYNTAX`**, **`EVENTS_READ_FAILED`**, **`VALIDATE_REGISTRY_USAGE`**, **`INTERNAL_ERROR`** (e.g. result failed output schema validation—should not occur in production).

**Note:** Duplicate `toolId` and JSON Schema failures are **exit 1**, not **3**: they produce structured issues on stdout so automation can parse fixes.

### Human stderr grammar (exit **1** only)

1. First line exactly: **`Registry validation failed:`**
2. Then zero or more lines, each starting with **`- structural (`** *kind* **`): `** *message*
3. Then zero or more lines for resolution issues, each starting with either:
   - **`- resolution (NO_STEPS_FOR_WORKFLOW): `** *message* (exactly one such line when there are no tool_observed events for the workflow after filtering), or
   - **`- resolution (workflow `** *workflowId* **` seq `** *seq* **` tool `** *toolId* **`): [`** *code* **`] `** *message*

Order: all **structural** lines first (JSON Schema issues sorted by `instancePath` then `keyword`; then other structural kinds in implementation order). **Resolution** lines are sorted by `seq` ascending, then `toolId` (with **`NO_STEPS_FOR_WORKFLOW`** first via null `seq`/`toolId` sort order).

### `RegistryValidationResult` semantics

- **`schemaVersion`**: **1**.
- **`valid`**: **`true`** iff **`structuralIssues`** and **`resolutionIssues`** are both empty. **`resolutionSkipped`** and **`eventLoad`** do not affect **`valid`**.
- **`structuralIssues`**: objects with **`kind`** one of **`json_schema`**, **`duplicate_tool_id`**, **`sql_effects_duplicate_effect_id`**, plus **`message`** and optional fields (`instancePath`, `keyword`, `toolId`, `effectId`).
- **`resolutionIssues`**: for per-step resolver failures, **`seq`** (integer) and **`toolId`** (string). For **`NO_STEPS_FOR_WORKFLOW`**, **`seq`** and **`toolId`** are JSON **`null`**; **`message`** equals **`RUN_LEVEL_MESSAGES.NO_STEPS_FOR_WORKFLOW`** in `failureCatalog.ts`.
- **`resolutionSkipped`**: divergent retry groups only: **`code`** **`RETRY_OBSERVATIONS_DIVERGE`**, **`message`** exactly **`RETRY_OBSERVATIONS_DIVERGE_MESSAGE`** in `failureCatalog.ts` (same literal as pipeline divergent step outcome).
- **`eventLoad`**: present iff both **`--events`** and **`--workflow-id`** were passed: **`workflowId`**, **`malformedEventLineCount`** (NDJSON lines that fail JSON parse or event schema, same counting rules as `loadEventsForWorkflow`).

Event-backed resolution uses **`loadEventsForWorkflow`** (including malformed line handling) and **`planLogicalSteps`**; divergent steps do not run `resolveVerificationRequest` and appear only in **`resolutionSkipped`**.

### Library

**`validateToolsRegistry({ registryPath, eventsPath?, workflowId? })`** returns the same object written to stdout by the CLI. If **`eventsPath`** or **`workflowId`** is set without the other, it throws **`TruthLayerError`** with **`VALIDATE_REGISTRY_USAGE`**. File read / JSON parse errors throw the same **`TruthLayerError` codes** as the CLI would use for exit **3**.

## Workflow result: multi-effect shape

When the registry used `sql_effects`, the step’s **`verificationRequest`** on `WorkflowResult` is:

```json
{
  "kind": "sql_effects",
  "effects": [
    {
      "id": "string",
      "kind": "sql_row",
      "table": "string",
      "keyColumn": "string",
      "keyValue": "string",
      "requiredFields": {}
    }
  ]
}
```

The step’s **`evidenceSummary`** **must** be exactly:

```json
{
  "effectCount": <N>,
  "effects": [
    {
      "id": "<same as in verificationRequest>",
      "status": "verified" | "missing" | "inconsistent" | "incomplete_verification",
      "reasons": [],
      "evidenceSummary": {}
    }
  ]
}
```

with **`effects`** sorted by **`id`** (UTF-16 lexicographic). Single-`sql_row` steps **must not** use top-level keys `effectCount` or `effects` on `evidenceSummary` (schema-enforced).

**Step rollup (multi-effect only):** all effects `verified` → step `verified`. Any effect `incomplete_verification` → step `incomplete_verification`. Else if every effect is `missing` or `inconsistent` → step `inconsistent` with one summary reason `MULTI_EFFECT_ALL_FAILED`. Else if at least one `verified` and at least one `missing`/`inconsistent` → step `partially_verified` with one summary reason `MULTI_EFFECT_PARTIAL`.

## SQL connector contract

### SQLite (`node:sqlite`)

- Only query: `SELECT * FROM "<table>" WHERE "<keyColumn>" = ? LIMIT 2` with `String(keyValue)` bound.

### Postgres (`pg.Client`)

- Only query: `SELECT * FROM "<table>" WHERE "<keyColumn>" = $1 LIMIT 2` with one text parameter `String(keyValue)`.
- Session: **`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`** before any verification statement, then mandatory `SELECT 1`, then verification `SELECT`s.

### Shared

- Column names in results are normalized to **lowercase** before reconciliation.

## Reconciler rule table (`sql_row`)

Precondition: iterate `requiredFields` keys in **lexicographic** order.

Let `n = rows.length` after `LIMIT 2`.

1. Connector throws → `incomplete_verification` / `CONNECTOR_ERROR` (`message` passed through `formatOperationalMessage`; do not rely on exact string equality across drivers).
2. `n === 0` → `missing` / `ROW_ABSENT`.
3. `n >= 2` → `inconsistent` / `DUPLICATE_ROWS` (no field inspection).
4. `n === 1`, row `row`, for each key `k` in sorted order, `col = k.toLowerCase()`:
   - `col` not in `row` → `incomplete_verification` / `ROW_SHAPE_MISMATCH`.
   - `typeof row[col] === "object"` and not `null` and not `Date` → `incomplete_verification` / `UNREADABLE_VALUE`.
   - Otherwise evaluate **`verificationScalarsEqual(requiredFields[k], row[col])`** (implemented in `valueVerification.ts`). On **no match**: `inconsistent` / `VALUE_MISMATCH`, reason message exactly **`Expected <expected> but found <actual> for field <k>`** where `<expected>` and `<actual>` are **canonical display** strings (see below), and `evidenceSummary` includes **`field`**, **`expected`**, **`actual`**, **`rowCount`: 1**.
5. All fields pass (or `requiredFields` empty) → `verified`.

### Canonical display (for message + `evidenceSummary`)

Used for `<expected>` and `<actual>`:

- Expected or actual **null** (including **undefined** in the row): token **`null`** (four lowercase ASCII letters, no quotes).
- **Boolean**: **`true`** or **`false`** (lowercase).
- **Number** (finite): **`String(n)`** in ECMAScript. **`NaN`**, **`Infinity`**, **`-Infinity`**: **`NaN`**, **`Infinity`**, **`-Infinity`** respectively.
- **String** (expected or actual): **`JSON.stringify(s)`** (quotes and JSON escapes).
- **BigInt** (actual): **`JSON.stringify(actual.toString())`**.
- **Date** (actual, valid): **`JSON.stringify(actual.toISOString())`**.

### Matching (`verificationScalarsEqual`) — evaluate in this order; first matching rule decides

1. **Expected `null`**: **match** iff `actual === null || actual === undefined`.
2. **Actual `null` or `undefined`**, expected not `null`: **no match**.
3. **Expected `boolean`**: **match** iff (`typeof actual === "boolean"` && `actual === expected`) **or** (`typeof actual === "number"` && `Number.isFinite(actual)` && ((`expected === true` && `actual === 1`) || (`expected === false` && `actual === 0`))).
4. **Expected `number`**: if `!Number.isFinite(expected)`, **no match**. Otherwise:
   - **4a.** `typeof actual === "number"` && `Number.isFinite(actual)` && `actual === expected` → **match**.
   - **4b.** `typeof actual === "bigint"` && `Number.isInteger(expected)` && `expected >= Number.MIN_SAFE_INTEGER` && `expected <= Number.MAX_SAFE_INTEGER` && `actual === BigInt(expected)` → **match**.
   - **4c.** `typeof actual === "string"`: let `t = actual.trim()`. **Match** iff `JSON.parse(t)` is a finite `number`, `JSON.parse(t) === expected`, and **`JSON.stringify(JSON.parse(t)) === JSON.stringify(expected)`** (rejects strings such as `"042"` where `JSON.parse` throws).
5. **Expected `string`**: let `e = expected.trim()`.
   - **5a.** `typeof actual === "string"` → **match** iff `actual.trim() === e`.
   - **5b.** `typeof actual === "number"` && `Number.isFinite(actual)` → **match** iff `e === JSON.stringify(actual)`.
   - **5c.** `typeof actual === "boolean"` → **match** iff `e === JSON.stringify(actual)`.
   - **5d.** `actual instanceof Date` && valid time → **match** iff `e === actual.toISOString()`.
   - Otherwise **no match**.
6. If no rule above matched, **no match**.

Coercion is **only** what this section defines; there is no separate `String(row[col]).trim()` equality path.

## Verification policy (normative)

**`WorkflowResult.verificationPolicy`** is always emitted (see schema). **`strong`:** timing fields are **`0`**; one SQL read per logical step (or one multi-effect rollup per step). **`eventual`:** **`verificationWindowMs`** and **`pollIntervalMs`** are integers ≥ **1** with **`pollIntervalMs` ≤ `verificationWindowMs`**. The executor repeats reads until a terminal outcome or the window elapses. Row absence alone until the window ends → step **`uncertain`** (not **`missing`**). Determinate outcomes (**`inconsistent`**, **`incomplete_verification`**, **`partially_verified`**) stop polling immediately. **SQLite:** `strong` uses the synchronous runner; `eventual` uses the async runner with real delays between polls. **Postgres:** always the async path.

## Workflow status (PRD-aligned)

Step statuses: `verified` | `missing` | `inconsistent` | `incomplete_verification` | `partially_verified` | `uncertain`.

| Workflow status | Condition |
|-----------------|-----------|
| `incomplete` | Any run-level code (`MALFORMED_EVENT_LINE`, …), **or** zero steps, **or** any step `incomplete_verification`. |
| `inconsistent` | Not incomplete as above, and any step in `{ missing, inconsistent, partially_verified }`. |
| `complete` | Not incomplete, every step `verified`. |

**Note:** Step **`uncertain`** does not by itself force `incomplete` before determinate failures are checked: e.g. **`uncertain` + `missing`** → workflow **`inconsistent`**. **`uncertain`** alone (with other steps `verified` or only `uncertain`) yields **`incomplete`** via the default branch when no step is `incomplete_verification`.

**PRD mapping:** PRD §4 “Failed” (determinate bad outcome) ↔ `inconsistent`. §4 “Incomplete” (cannot confirm) ↔ `incomplete`. §6 three bullets ↔ these three strings. **Multi-effect:** step-level “partial success” is `partially_verified`; the workflow is still **`inconsistent`** until every step is `verified`.

**Compatibility:** Emitted **`WorkflowResult.schemaVersion`** is **6** with required **`workflowTruthReport`**. The engine-only JSON (`schemaVersion` **5**) is defined by [`schemas/workflow-engine-result.schema.json`](../schemas/workflow-engine-result.schema.json). Required **`verificationPolicy`** and **`eventSequenceIntegrity`**; non-**`verified`** steps require **`failureDiagnostic`**; consumers must allow step `status` **`uncertain`** (see [`schemas/workflow-result.schema.json`](../schemas/workflow-result.schema.json)).

## Cross-run comparison (normative)

This section defines **cross-run comparison**: comparing saved workflow artifacts locally (no hosted backend). **Inputs** are validated with **`schemas/workflow-result-compare-input.schema.json`**: each file is either **`WorkflowEngineResult`** (**`schemaVersion` 5**) or emitted **`WorkflowResult`** (**`schemaVersion` 6**). The CLI normalizes each input to emitted v6 (`finalizeEmittedWorkflowResult` for v5; for v6, recomputes truth and requires **`util.isDeepStrictEqual`** match with embedded **`workflowTruthReport`** — mismatch → exit **3**, **`COMPARE_WORKFLOW_TRUTH_MISMATCH`**). The machine output is **`RunComparisonReport`** (`schemas/run-comparison-report.schema.json`); behavioral semantics below are authoritative—the schema is structural only (see [`$comment`](../schemas/run-comparison-report.schema.json)).

### `logicalStepKey`

For a step with **`verificationRequest !== null`**:

- **`sql_row`:** `sql_row|${table}|${keyColumn}|${keyValue}` (field values from the resolved request on the step outcome).
- **`sql_effects`:** `sql_effects|` followed by one segment per effect, **sorted by effect `id` in UTF-16 lexicographic order** (same ordering as `compareUtf16Id` / object key sort elsewhere in this doc). Each segment is: `id|${id}|${table}|${keyColumn}|${keyValue}|`.

**Duplicate `logicalStepKey` in one run:** If two steps produce the same key, **keep the step with the lower `seq`** for that key. Emit **`ambiguousLogicalKeyResolutions`** on the report with `chosenSeq` and `droppedSeq`.

### Pairwise comparison (immediate prior vs current)

Inputs are an **ordered list** of runs `R0 … R(n-1)` where **`R(n-1)` is current** and **`R(n-2)` is immediate prior** (`n ≥ 2`).

**Run-level:** Let `M_prior` and `M_cur` be **multisets** of `runLevelReasons[].code`. **introducedRunLevelCodes** = multiset difference `M_cur − M_prior` (expand as a sorted list with multiplicity for JSON). **resolvedRunLevelCodes** = `M_prior − M_cur`.

**Bucket A — steps with `verificationRequest !== null`:** Build `logicalStepKey → step` for each run (duplicate rule above). Align by **key**, not by `seq`. For each key:

- **Intersection, both verified:** `unchangedOk`. Report `seqPrior`, `seqCurrent`, `toolIdPrior`, `toolIdCurrent` so **reordering is visible** without implying failure churn.
- **Intersection, prior verified / current failing:** `introducedFailure`.
- **Intersection, prior failing / current verified:** `resolvedFailure`.
- **Intersection, both failing:** `bothFailing` with multiset differences on step-level `reasons[].code` (**introducedStepReasonCodes**, **resolvedStepReasonCodes**). For `sql_effects`, also compare each effect row in `evidenceSummary.effects` **by effect `id`**: same verified/failing and multiset reason deltas per effect. **`toolIdChanged`** is set when `toolId` differs at the same key; it does not override failure classification.
- **Key only in prior:** `structuralRemoval` with `priorWasFailing`.
- **Key only in current:** `structuralAddition` with `currentIsFailing`.

**Bucket B — `verificationRequest === null` and failing:** Consider only steps with **`status !== "verified"`**. Compute **`recurrenceSignature`** (below) per such step. Let **P** and **C** be **multisets** of signatures (one entry per failing step; **no** within-run dedup). **introducedFailureSignatures** / **resolvedFailureSignatures** are multiset differences; **unchangedFailureInstanceCounts** lists `min(P(s), C(s))` per signature `s`.

### `recurrenceSignature` (failing steps)

Used for **bucket B** and **recurrence**. **Must not** include `seq` or `toolId`.

Format:

1. `${status}|` then step-level reason codes sorted **lexicographically (UTF-16)** with multiplicity (sort the multiset as a list of `reasons[].code` strings).
2. For each **failing** effect in `evidenceSummary.effects` (when present), sorted by effect `id` (UTF-16), append `|e:${id}:${status}:r:` + effect reason codes sorted the same way, concatenated with commas.

### Recurrence over the full window

For each run index `i`, build the **set** of `recurrenceSignature` values from **all failing steps** in that run (**within-run dedup**: each signature counted once per run for membership). A signature is **recurrent** if it appears in runs at **≥ 2 distinct indices**. Report `runIndices`, `runsHitCount`, and up to **3 exemplars** `{ runIndex, seq, toolId }` per pattern (exemplars are **not** part of signature equality).

### Success and failure I/O (compare subcommand)

**Success:** Write **one** human summary line block to **stderr** (`formatRunComparisonReport`), then **one** JSON object to **stdout** (`RunComparisonReport`). Exit **0**.

**Operational failure:** **No** comparison JSON on **stdout** (stdout empty). **Stderr** is **exactly one** JSON line: the same **`execution_truth_layer_error`** envelope as [CLI operational errors](#cli-operational-errors), with a **`COMPARE_*`** code. Exit **3**.

### Cross-run comparison: implementation bindings (normative)

- **CLI:** `verify-workflow compare --prior <path> [--prior <path> …] --current <path>`. Each `--prior` is a saved **`WorkflowResult`** JSON file; order is oldest → newest; **`--current`** is the last run. At least one `--prior` is required.
- **`displayLabel`:** Integrator-supplied opaque string per run. The **reference CLI** sets **`displayLabel`** to the **basename** of each file path (never a full path in the report).
- **Failure envelope:** Same shape and rules as § CLI operational errors; compare-specific codes live in `failureCatalog.ts` (e.g. `COMPARE_USAGE`, `COMPARE_WORKFLOW_ID_MISMATCH`, `COMPARE_WORKFLOW_TRUTH_MISMATCH`, `COMPARE_INPUT_READ_FAILED`, `COMPARE_INPUT_JSON_SYNTAX`, `COMPARE_INPUT_SCHEMA_INVALID`, `COMPARE_RUN_COMPARISON_REPORT_INVALID`).
- **Schema:** `schemas/run-comparison-report.schema.json` validates stdout on success; root **`$comment`** points to this document’s **Cross-run comparison (normative)** anchor.

## Validation matrix (what CI proves vs operations)

| Claim | Proven in CI / local | Proven in production / pilot only |
|-------|----------------------|-----------------------------------|
| No `complete` without SQL verification | Yes — integration tests | — |
| Postgres session read-only + SELECT-only role | Yes — `postgres-session-readonly` / `postgres-privilege` tests | — |
| Four step statuses + retries / divergent seq / unknown tool / malformed line | Yes — `npm test` | — |
| Framework-agnostic capture | Yes — NDJSON contract + examples | Integration list / adapters |
| Manual verification steps ↓, time-to-confirm ↓, trust / re-runs | No | Metrics & study (define counters in ops) |

**Engineering MVP “solved”:** `npm test` passes; CLI obeys exit codes; contracts match this document.

## Examples

Bundled files under [`examples/`](../examples/): `seed.sql`, `tools.json`, `events.ndjson`.

- **Onboarding:** run `npm run first-run` from the repository root. The onboarding driver is [`scripts/first-run.mjs`](../scripts/first-run.mjs), invoked only via that npm script (`npm run build && node scripts/first-run.mjs`). It seeds `examples/demo.db`, then verifies workflows `wf_complete` (expect `complete` / `verified`) and `wf_missing` (expect `inconsistent` / `missing` / `ROW_ABSENT`).

(Node may print an experimental warning for `node:sqlite` depending on version.)
