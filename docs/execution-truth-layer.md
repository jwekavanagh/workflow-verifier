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
| `failureCatalog.ts` | Stable run-level literals, `formatOperationalMessage`, CLI error envelope helpers, `CLI_OPERATIONAL_CODES` |
| `truthLayerError.ts` | `TruthLayerError` for coded I/O and registry failures |
| `loadEvents.ts` | Read NDJSON, validate, filter `workflowId`, stable sort by `seq` |
| `planLogicalSteps.ts` | Stable sort, group by `seq`, canonical params equality, divergence vs last observation |
| `resolveExpectation.ts` | Registry + params → `VerificationRequest`; `intendedEffect` template rendering (audit only) |
| `valueVerification.ts` | Canonical display strings + `verificationScalarsEqual` (single scalar comparison table) |
| `sqlConnector.ts` | SQLite parameterized read; lowercase column keys |
| `sqlReadBackend.ts` | `buildSelectByKeySql`, Postgres `SqlReadBackend`, `connectPostgresVerificationClient`, `applyPostgresVerificationSessionGuards` |
| `reconciler.ts` | `reconcileFromRows` (pure rule table), `reconcileSqlRow` (SQLite sync), `reconcileSqlRowAsync` (Postgres) |
| `multiEffectRollup.ts` | `rollupMultiEffectsSync` / `rollupMultiEffectsAsync`: per-effect reconcile, UTF-16 sort by effect `id`, step rollup (`verified` / `partially_verified` / `inconsistent` / `incomplete_verification`) |
| `aggregate.ts` | Workflow status precedence |
| `workflowTruthReport.ts` | `formatWorkflowTruthReport`, `STEP_STATUS_TRUTH_LABELS`; fixed human report grammar |
| `pipeline.ts` | Orchestration: `runLogicalStepsVerification` (internal), async `verifyWorkflow`, sync `verifyToolObservedStep`, `withWorkflowVerification` (SQLite `dbPath` only); default `truthReport` / `logStep` |
| `cli.ts` | CLI entry |

### Engineer note: shared step core

`reconcileFromRows` in `reconciler.ts` is the single rule table. `planLogicalSteps` collapses multiple observations per `seq`; `verifyToolObservedStep` (SQLite, sync) reconciles the **last** observation per logical step when observations are non-divergent. `verifyWorkflow` and `withWorkflowVerification` both call the same internal `runLogicalStepsVerification` once per run (SQLite sync / Postgres async). **Why:** One classification table; one logical step per `seq`; SQLite stays synchronous at the integrator boundary; Postgres stays on the batch path only.

### Low-friction integration (in-process)

Primary integration for running workflows in code: **`await withWorkflowVerification(options, run)`** from `pipeline.ts` (re-exported in the package entry). The `run` callback receives **`observeStep`**; call it after each tool with one [event line](#event-line-schema) object. There is **no** public `finish` — after `run` completes successfully, the library builds the **`WorkflowResult`** (including SQL verification) **before** closing the read-only SQLite handle in **`finally`**.

**`withWorkflowVerification` is SQLite-only** (option `dbPath` → read-only file). For Postgres ground truth, replay NDJSON and call **`await verifyWorkflow`** with `database: { kind: "postgres", connectionString }` or use the CLI (`--postgres-url`). **Why:** Keeps `observeStep` synchronous and a single stable hook; async `pg` is isolated to batch verification.

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
4. Run:

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

**I/O order (CLI — verdict paths 0/1/2):** **`verifyWorkflow`** emits the human report via default **`truthReport`** to **stderr** first, then the CLI writes **stdout**. So: **stderr (human) → stdout (JSON)**.

**stdout:** Single JSON object matching `schemas/workflow-result.schema.json` (`schemaVersion` **`2`**; includes required **`runLevelReasons`** alongside **`runLevelCodes`**; each step includes **`repeatObservationCount`** and **`evaluatedObservationOrdinal`**).

**stderr (verdict paths):** One **human truth report** per verification (same text as `formatWorkflowTruthReport`); see [Human truth report](#human-truth-report).

### CLI operational errors

When the CLI exits **3**, **stderr** is exactly **one** UTF-8 line: a JSON object with:

- `schemaVersion`: **1**
- `kind`: **`execution_truth_layer_error`**
- `code`: one of **`CLI_USAGE`**, **`REGISTRY_READ_FAILED`**, **`REGISTRY_JSON_SYNTAX`**, **`REGISTRY_SCHEMA_INVALID`**, **`REGISTRY_DUPLICATE_TOOL_ID`**, **`EVENTS_READ_FAILED`**, **`SQLITE_DATABASE_OPEN_FAILED`**, **`POSTGRES_CLIENT_SETUP_FAILED`**, **`WORKFLOW_RESULT_SCHEMA_INVALID`**, **`INTERNAL_ERROR`**
- `message`: human-readable text after whitespace normalization and truncation (max **2048** JavaScript string length; see `formatOperationalMessage` in `failureCatalog.ts`)

**stdout** must be empty on exit **3**. Automation should key on **`code`**, not exact **`message`**, for driver-dependent errors.

### Human truth report

This section is **normative**: literals and line shape match `formatWorkflowTruthReport` in `workflowTruthReport.ts` and the contract tests.

**Why this shape**

- **One formatter, one string:** CLI, `verifyWorkflow`, and `withWorkflowVerification` share the same text—no drift between surfaces.
- **stderr human / stdout JSON:** Automation keeps a single JSON record on stdout (`jq`, pipes); operators read the verdict on stderr.
- **Default `truthReport` to stderr:** Gives a clear truth signal without extra configuration; silent tests pass `truthReport: () => {}`.
- **Default `logStep` no-op:** Removes the old default of one JSON object per step on stderr, which duplicated `WorkflowResult` and conflicted with the human report.
- **Fixed `trust:` lines and step labels (`STEP_STATUS_TRUTH_LABELS`):** Stable strings for alerts, screenshots, and training; each `trust:` line maps to one `WorkflowStatus` from `aggregate.ts`.
- **Run-level lines:** Each line uses **`runLevelReasons`** from `WorkflowResult`: `code` + `message` from each `Reason` (same literals as `failureCatalog.ts` for catalog-defined codes).
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
   - If `runLevelReasons` is empty: line exactly `run_level: (none)`.
   - Otherwise: line `run_level:` then one line per entry in **`runLevelReasons`** order, each `  - ` + `reason.code` + `: ` + `reason.message` (trimmed for display consistency with step reasons).
   - `runLevelCodes[i]` always equals `runLevelReasons[i].code` (derived from `runLevelReasons` at aggregation). When there are no matching events for the workflow id, the library appends **`NO_STEPS_FOR_WORKFLOW`** with message `No tool_observed events for this workflow id after filtering.`
   - Catalog literal for **`MALFORMED_EVENT_LINE`**: `Event line was missing, invalid JSON, or failed schema validation for a tool observation.`

3. **Steps**
   - Line exactly `steps:`.
   - For each step in array order: one line `  - seq=` + decimal seq + ` tool=` + toolId + ` status=` + label, where label is from **`STEP_STATUS_TRUTH_LABELS`** (defensive: `\r`/`\n` in toolId → `_`). Status → label mapping:

| Step status | Label |
|-------------|--------|
| `verified` | `VERIFIED` |
| `missing` | `FAILED_ROW_MISSING` |
| `inconsistent` | `FAILED_VALUE_MISMATCH` |
| `incomplete_verification` | `INCOMPLETE_CANNOT_VERIFY` |
| `partially_verified` | `PARTIALLY_VERIFIED` |

   - Immediately after that header line: exactly one line `    observations: evaluated=` + decimal `evaluatedObservationOrdinal` + ` of ` + decimal `repeatObservationCount` + ` in_capture_order` (four spaces before `observations:`; no trailing spaces; no period).
   - For each reason: `    reason: [` + code + `] ` + trimmed message, or `(no message)` if the message is empty after trim; if `field` is set and non-empty, append ` field=` + field value.
   - If `intendedEffect` is non-empty after trim: `    intended: ` + single-line text (each `\r`/`\n` replaced by ASCII space, runs of spaces collapsed, trimmed).
   - **Multi-effect steps:** when `evidenceSummary.effects` is present (see [Workflow result: multi-effect shape](#workflow-result-multi-effect-shape)), after `intended:` (if any), emit one line per effect in **UTF-16 lexicographic order of effect `id`** (same comparator as `canonicalJsonForParams` object keys): `    effect: id=` + id + ` status=` + per-effect label, where per-effect labels use the same mapping as the table above **except** `partially_verified` does not appear at the effect level. For each effect with non-empty `reasons`, emit `      reason: [` + code + `] ` + message (six spaces before `reason:`), with optional ` field=` as for step-level reasons.

**Engineer note:** Any change to fixed sentences or labels requires updating golden tests and `test/docs-contract.test.mjs` pins.

### Operator

- **Reading logs:** Treat **stderr** as the human verdict for a verification run; **stdout** (CLI) is the machine-readable `WorkflowResult`. Correlate them by process / timestamp in your log stack.
- **`trust:` line:** Treat as **trusted** only when it is the `TRUSTED:` sentence **and** `workflow_status: complete`. Any `NOT_TRUSTED:` means the workflow must not be treated as fully verified—investigate `steps:` and `run_level:`.
- **Exit codes:** 0 = `complete`, 1 = `inconsistent`, 2 = `incomplete`, 3 = operational failure ([CLI operational errors](#cli-operational-errors)); **`--help`** exits **0**.
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

## Workflow status (PRD-aligned)

Step statuses: `verified` | `missing` | `inconsistent` | `incomplete_verification` | `partially_verified`.

| Workflow status | Condition |
|-----------------|-----------|
| `incomplete` | Any run-level code (`MALFORMED_EVENT_LINE`, …), **or** zero steps, **or** any step `incomplete_verification`. |
| `inconsistent` | Not incomplete as above, and any step in `{ missing, inconsistent, partially_verified }`. |
| `complete` | Not incomplete, every step `verified`. |

**PRD mapping:** PRD §4 “Failed” (determinate bad outcome) ↔ `inconsistent`. §4 “Incomplete” (cannot confirm) ↔ `incomplete`. §6 three bullets ↔ these three strings. **Multi-effect:** step-level “partial success” is `partially_verified`; the workflow is still **`inconsistent`** until every step is `verified`.

**Compatibility:** `WorkflowResult.schemaVersion` remains **2**; consumers must allow the new step `status` literal `partially_verified` and `verificationRequest.kind` `sql_effects` (see [`schemas/workflow-result.schema.json`](../schemas/workflow-result.schema.json)).

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
