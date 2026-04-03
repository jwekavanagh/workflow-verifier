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
| `schemaLoad.ts` | AJV 2020-12 validators for event line, registry, workflow result |
| `loadEvents.ts` | Read NDJSON, validate, filter `workflowId`, sort by `seq`, detect `DUPLICATE_SEQ` |
| `resolveExpectation.ts` | Registry + params → `VerificationRequest`; `intendedEffect` template rendering (audit only) |
| `sqlConnector.ts` | SQLite parameterized read; lowercase column keys |
| `sqlReadBackend.ts` | `buildSelectByKeySql`, Postgres `SqlReadBackend`, `connectPostgresVerificationClient`, `applyPostgresVerificationSessionGuards` |
| `reconciler.ts` | `reconcileFromRows` (pure rule table), `reconcileSqlRow` (SQLite sync), `reconcileSqlRowAsync` (Postgres) |
| `aggregate.ts` | Workflow status precedence |
| `workflowTruthReport.ts` | `formatWorkflowTruthReport`, `STEP_STATUS_TRUTH_LABELS`; fixed human report grammar |
| `pipeline.ts` | Orchestration: async `verifyWorkflow` (SQLite or Postgres `database` option), sync `verifyToolObservedStep`, `withWorkflowVerification` (SQLite `dbPath` only); default `truthReport` / `logStep` |
| `cli.ts` | CLI entry |

### Engineer note: shared step core

`reconcileFromRows` in `reconciler.ts` is the single rule table. `verifyToolObservedStep` (SQLite, sync) backs `withWorkflowVerification` and the SQLite branch of `verifyWorkflow`. The Postgres branch uses an internal async step path that calls `reconcileSqlRowAsync` after the same fetch semantics. **Why:** One classification table; SQLite stays synchronous at the integrator boundary; Postgres stays on the batch path only.

### Integrator

### Low-friction integration (in-process)

Primary integration for running workflows in code: **`await withWorkflowVerification(options, run)`** from `pipeline.ts` (re-exported in the package entry). The `run` callback receives **`observeStep`**; call it after each tool with one [event line](#event-line-schema) object. There is **no** public `finish` — the library closes the read-only SQLite handle in a `finally` block after `run` completes or throws.

**`withWorkflowVerification` is SQLite-only** (option `dbPath` → read-only file). For Postgres ground truth, replay NDJSON and call **`await verifyWorkflow`** with `database: { kind: "postgres", connectionString }` or use the CLI (`--postgres-url`). **Why:** Keeps `observeStep` synchronous and a single stable hook; async `pg` is isolated to batch verification.

One root boundary; library owns DB close in finally; avoids silent leaks when integrators omit a terminal call.

Normative contracts:

- **`observeStep` input:** Only a JavaScript **non-null object** is schema-validated against the event schema; **strings and primitives are not parsed as NDJSON**—non-objects yield **`MALFORMED_EVENT_LINE`** (same run-level meaning as a bad NDJSON line in batch mode).
- **`withWorkflowVerification` return:** **`Promise<WorkflowResult>`** fulfilled on success; **rejected** on invalid registry/DB setup (before `run`) or if **`run`** throws or rejects — after the DB is closed in **`finally`**.
- **Post-close `observeStep`:** If a caller keeps the injected function and uses it after the run, it throws **`Error`** with message **`Workflow verification observeStep invoked after workflow run completed`**.
- **Parity:** Feeding the same event objects in file order as an NDJSON workflow must match **`await verifyWorkflow`** on that file for the same `workflowId`, `registryPath`, and SQLite `database: { kind: "sqlite", path }` (same file path as `dbPath` for the hook).

**Defaults (`truthReport` / `logStep`):** **`withWorkflowVerification`** uses the same defaults as **`verifyWorkflow`**: **`truthReport`** writes the canonical human report (see [Human truth report](#human-truth-report)) to **stderr** once when the `WorkflowResult` is ready; **`logStep`** default is a **no-op** (no per-step stderr JSON). Override with `truthReport: () => {}` in tests. **Migration:** if you depended on previous default per-step JSON on stderr, pass an explicit `logStep`, e.g. `(obj) => console.error(JSON.stringify(obj))`. For custom UIs while keeping canonical copy: `import { formatWorkflowTruthReport } from '<package>'`. **Migration:** `verifyWorkflow` is **async** and takes **`database`** instead of `dbPath`; use `database: { kind: "sqlite", path }` for file-backed batch verification.

### Postgres verification (batch and CLI)

- **Library:** `await verifyWorkflow({ workflowId, eventsPath, registryPath, database: { kind: "postgres", connectionString }, … })`. One **`pg.Client`** per invocation: `connect()` → **`applyPostgresVerificationSessionGuards`** (runs **`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`**) → **`SELECT 1`** on that client → per-step parameterized verification `SELECT`s → `client.end()` in `finally` (cleanup errors must not mask the primary failure).
- **CLI:** Exactly one of `--db <sqlitePath>` or **`--postgres-url <url>`**. Connection or guard failure **throws** before steps; the CLI prints the error to **stderr** and exits **2** with **no** JSON on stdout.
- **Safety evidence in CI:** Tests assert (1) after session guards, **`INSERT` into `readonly_probe`** fails with **read-only transaction** (`25006`), and (2) role **`verifier_ro`** has **SELECT only** on verification tables (`INSERT` denied `42501`). Operators should still use a **least-privilege DB user** and TLS (`sslmode` in the URL) in real environments.

### Batch and CLI (replay)

For CI, audits, or logs written as NDJSON:

1. To verify your checkout with bundled `examples/` artifacts, run `npm run first-run` from the repository root (see [Examples](#examples)). It builds the project, creates `examples/demo.db` from `seed.sql`, and runs two sample workflows.
2. After **each** tool call, append one JSON object line to your NDJSON file (see [Event line schema](#event-line-schema)).
3. Maintain `tools.json` with one entry per `toolId` your workflows emit.
4. Run:

```bash
npm run build
node dist/cli.js --workflow-id <id> --events <path> --registry <path> --db <sqlitePath>
# or
node dist/cli.js --workflow-id <id> --events <path> --registry <path> --postgres-url <postgresql-url>
```

**Why:** Same event contract for CI and external logs without requiring in-process wrapper.

**Exit codes**

| Code | `workflow.status` |
|------|-------------------|
| 0 | `complete` |
| 1 | `inconsistent` |
| 2 | `incomplete` |

**I/O order (CLI):** For each run, **`verifyWorkflow`** emits the human report via default **`truthReport`** to **stderr** first, then the CLI writes **stdout**. So: **stderr (human) → stdout (JSON)**.

**stdout:** Single JSON object matching `schemas/workflow-result.schema.json`.

**stderr:** One **human truth report** per verification (same text as `formatWorkflowTruthReport`); see [Human truth report](#human-truth-report).

### Human truth report

This section is **normative**: literals and line shape match `formatWorkflowTruthReport` in `workflowTruthReport.ts` and the contract tests.

**Why this shape**

- **One formatter, one string:** CLI, `verifyWorkflow`, and `withWorkflowVerification` share the same text—no drift between surfaces.
- **stderr human / stdout JSON:** Automation keeps a single JSON record on stdout (`jq`, pipes); operators read the verdict on stderr.
- **Default `truthReport` to stderr:** Gives a clear truth signal without extra configuration; silent tests pass `truthReport: () => {}`.
- **Default `logStep` no-op:** Removes the old default of one JSON object per step on stderr, which duplicated `WorkflowResult` and conflicted with the human report.
- **Fixed `trust:` lines and step labels (`STEP_STATUS_TRUTH_LABELS`):** Stable strings for alerts, screenshots, and training; each `trust:` line maps to one `WorkflowStatus` from `aggregate.ts`.
- **Run-level lines for known codes + fallback:** Today only `MALFORMED_EVENT_LINE` and `DUPLICATE_SEQ` are emitted; unknown codes still render with a generic explanation.
- **No trailing newline inside the returned string:** The default `truthReport` implementation appends `\n` when writing to stderr.

**Grammar (UTF-8; lines separated by `\n` only; returned string has no trailing `\n`)**

1. **Header — exactly three lines**
   - `workflow_id: ` + workflow id (defensive: replace `\r`/`\n` in the id with `_`).
   - `workflow_status: ` + exactly `complete`, `incomplete`, or `inconsistent`.
   - `trust: ` + exactly one of:
     - `TRUSTED: Every step matched the database under the configured verification rules.` when status is `complete`.
     - `NOT_TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.` when status is `incomplete`.
     - `NOT_TRUSTED: At least one step failed verification against the database (determinate failure).` when status is `inconsistent`.

2. **Run-level**
   - If `runLevelCodes` is empty: line exactly `run_level: (none)`.
   - Otherwise: line `run_level:` then one line per code in array order, each `  - ` + code + `: ` + explanation, where:
     - `MALFORMED_EVENT_LINE` → `Event line was missing, invalid JSON, or failed schema validation for a tool observation.`
     - `DUPLICATE_SEQ` → `Duplicate seq values appeared for this workflow; ordering may be unreliable.`
     - any other code → `Unknown run-level code (forward compatibility).`

3. **Steps**
   - Line exactly `steps:`.
   - For each step in array order: one line `  - seq=` + decimal seq + ` tool=` + toolId + ` status=` + label, where label is from **`STEP_STATUS_TRUTH_LABELS`** (defensive: `\r`/`\n` in toolId → `_`). Status → label mapping:

| Step status | Label |
|-------------|--------|
| `verified` | `VERIFIED` |
| `missing` | `FAILED_ROW_MISSING` |
| `partial` | `UNCERTAIN_NULL_FIELD` |
| `inconsistent` | `FAILED_VALUE_MISMATCH` |
| `incomplete_verification` | `INCOMPLETE_CANNOT_VERIFY` |

   - For each reason: `    reason: [` + code + `] ` + trimmed message, or `(no message)` if the message is empty after trim; if `field` is set and non-empty, append ` field=` + field value.
   - If `intendedEffect` is non-empty after trim: `    intended: ` + single-line text (each `\r`/`\n` replaced by ASCII space, runs of spaces collapsed, trimmed).

**Engineer note:** Any change to fixed sentences or labels requires updating golden tests and `test/docs-contract.test.mjs` pins.

### Operator

- **Reading logs:** Treat **stderr** as the human verdict for a verification run; **stdout** (CLI) is the machine-readable `WorkflowResult`. Correlate them by process / timestamp in your log stack.
- **`trust:` line:** Treat as **trusted** only when it is the `TRUSTED:` sentence **and** `workflow_status: complete`. Any `NOT_TRUSTED:` means the workflow must not be treated as fully verified—investigate `steps:` and `run_level:`.
- **Exit codes:** Same mapping as [above](#batch-and-cli-replay) (0 = `complete`, 1 = `inconsistent`, 2 = `incomplete`).
- DB user should be **read-only** in production (Postgres: **SELECT-only** role; the product also sets **session read-only** via `applyPostgresVerificationSessionGuards`).
- **`npm test`** requires Postgres 16+ and env **`POSTGRES_ADMIN_URL`** (superuser, runs [`scripts/pg-ci-init.mjs`](../scripts/pg-ci-init.mjs)) and **`POSTGRES_VERIFICATION_URL`** (role `verifier_ro` / SELECT-only on seeded tables). CI sets both; locally use the README Docker one-liner and export the same URLs.
- SQLite file must exist when `readOnly: true` is used (Node `DatabaseSync`).
- Redact secrets from `params` before writing events if logs are retained; **redact params in retained logs** when those logs leave the trust boundary. The human report can include **`intended:`** text from the registry template—apply the same redaction policy if that text can contain secrets.

## Event line schema

File: [`schemas/event.schema.json`](../schemas/event.schema.json).

Required fields per line:

- `schemaVersion`: `1`
- `workflowId`, `seq` (non-negative integer, monotonic per workflow in normal operation)
- `type`: `tool_observed`
- `toolId`, `params` (object)

**Not allowed on the event (MVP):** `expectation` / `verification` objects — the resolver must derive verification from the registry.

## Tool registry

File: [`schemas/tools-registry.schema.json`](../schemas/tools-registry.schema.json).

Each entry:

- `toolId` (unique)
- `effectDescriptionTemplate`: string with `{/json/pointer}` tokens → replaced with `JSON.stringify(value)` or `MISSING` (audit string only; **not** used for reconciliation).
- `verification`: `{ "kind": "sql_row", "table", "key", "requiredFields" }` where `table` / `key.column` / `key.value` / `requiredFields` use `{ "const": … }` or `{ "pointer": "/path" }`.

Resolved internal shape:

```json
{
  "kind": "sql_row",
  "table": "string",
  "keyColumn": "string",
  "keyValue": "string",
  "requiredFields": { "col": "expectedString" }
}
```

`requiredFields` values must be **strings** (MVP). Empty object = **presence-only** (row must exist).

### Resolver error codes → step `incomplete_verification`

| Code | Meaning |
|------|---------|
| `UNKNOWN_TOOL` | `toolId` not in registry |
| `RESOLVE_POINTER` | Missing pointer, wrong type, or non-string field value where required |
| `INVALID_IDENTIFIER` | Table / column / `requiredFields` key not matching `^[a-zA-Z_][a-zA-Z0-9_]*$` |

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

1. Connector throws → `incomplete_verification` / `CONNECTOR_ERROR`.
2. `n === 0` → `missing` / `ROW_ABSENT`.
3. `n >= 2` → `inconsistent` / `DUPLICATE_ROWS` (no field inspection).
4. `n === 1`, row `row`, for each key `k` in sorted order, `col = k.toLowerCase()`:
   - `col` not in `row` → `incomplete_verification` / `ROW_SHAPE_MISMATCH`.
   - `row[col]` is `null` or `undefined` → `partial` / `NULL_FIELD` (stop further checks for classification).
   - `typeof row[col] === "object"` and not `null` and not `Date` → `incomplete_verification` / `UNREADABLE_VALUE`.
   - Compare `String(row[col]).trim()` to `String(requiredFields[k]).trim()`; unequal → `inconsistent` / `VALUE_MISMATCH`.
5. All fields pass (or `requiredFields` empty) → `verified`.

No coercion beyond `String()` / `trim()`.

## Workflow status (PRD-aligned)

Step statuses: `verified` | `missing` | `partial` | `inconsistent` | `incomplete_verification`.

| Workflow status | Condition |
|-----------------|-----------|
| `incomplete` | Any run-level code (`MALFORMED_EVENT_LINE`, `DUPLICATE_SEQ`, …), **or** zero steps, **or** any step `incomplete_verification`. |
| `inconsistent` | Not incomplete as above, and any step in `{ missing, partial, inconsistent }`. |
| `complete` | Not incomplete, every step `verified`. |

**PRD mapping:** PRD §4 “Failed” (determinate bad outcome) ↔ `inconsistent`. §4 “Incomplete” (cannot confirm) ↔ `incomplete`. §6 three bullets ↔ these three strings.

## Validation matrix (what CI proves vs operations)

| Claim | Proven in CI / local | Proven in production / pilot only |
|-------|----------------------|-----------------------------------|
| No `complete` without SQL verification | Yes — integration tests | — |
| Postgres session read-only + SELECT-only role | Yes — `postgres-session-readonly` / `postgres-privilege` tests | — |
| Four falsifiable step outcomes + duplicates / unknown tool / dup seq / malformed line | Yes — `npm test` | — |
| Framework-agnostic capture | Yes — NDJSON contract + examples | Integration list / adapters |
| Manual verification steps ↓, time-to-confirm ↓, trust / re-runs | No | Metrics & study (define counters in ops) |

**Engineering MVP “solved”:** `npm test` passes; CLI obeys exit codes; contracts match this document.

## Examples

Bundled files under [`examples/`](../examples/): `seed.sql`, `tools.json`, `events.ndjson`.

- **Onboarding:** run `npm run first-run` from the repository root. The onboarding driver is [`scripts/first-run.mjs`](../scripts/first-run.mjs), invoked only via that npm script (`npm run build && node scripts/first-run.mjs`). It seeds `examples/demo.db`, then verifies workflows `wf_complete` (expect `complete` / `verified`) and `wf_missing` (expect `inconsistent` / `missing` / `ROW_ABSENT`).

(Node may print an experimental warning for `node:sqlite` depending on version.)
