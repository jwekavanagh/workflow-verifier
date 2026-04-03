# Execution Truth Layer (MVP) — Single Source of Truth

This document is the authoritative specification for the MVP. The product verifies **external SQL state** against expectations derived from **observed tool calls** and a **tool registry**, never from agent-reported success alone.

## Why this shape

- **NDJSON events**: One line per tool invocation provides a concrete “observe each step” capture surface that any agent stack can implement by appending JSON after each tool call.
- **Tool registry (`tools.json`)**: Keeps “intent → expected state” inside the product using RFC 6901 JSON Pointers into `params`, so events do not carry caller-supplied expectation blobs.
- **SQLite via `node:sqlite`**: Read-only `SELECT` against a file path gives reproducible ground truth in CI. The reference plan named `better-sqlite3`; this repo uses Node’s built-in module (**Node ≥ 22.13**) to avoid native compilation on constrained environments while preserving the same SQL contract (`SELECT * … WHERE … = ? LIMIT 2`, bound parameters only).

## Audiences

### Engineer

| Module | Role |
|--------|------|
| `schemaLoad.ts` | AJV 2020-12 validators for event line, registry, workflow result |
| `loadEvents.ts` | Read NDJSON, validate, filter `workflowId`, sort by `seq`, detect `DUPLICATE_SEQ` |
| `resolveExpectation.ts` | Registry + params → `VerificationRequest`; `intendedEffect` template rendering (audit only) |
| `sqlConnector.ts` | Parameterized read; lowercase column keys |
| `reconciler.ts` | Deterministic rule table (below) |
| `aggregate.ts` | Workflow status precedence |
| `pipeline.ts` | Orchestration |
| `cli.ts` | CLI entry |

### Integrator

1. After **each** tool call, append one JSON object line to your NDJSON file (see [Event line schema](#event-line-schema)).
2. Maintain `tools.json` with one entry per `toolId` your workflows emit.
3. Run:

```bash
npm run build
node dist/cli.js --workflow-id <id> --events <path> --registry <path> --db <path>
```

**Exit codes**

| Code | `workflow.status` |
|------|-------------------|
| 0 | `complete` |
| 1 | `inconsistent` |
| 2 | `incomplete` |

**stderr**: One JSON object per processed step (`intendedEffect`, `verificationRequest`, `status`, `reasons`, `evidenceSummary`).

**stdout**: Single JSON object matching `schemas/workflow-result.schema.json`.

### Operator

- DB user should be **read-only** in production.
- SQLite file must exist when `readOnly: true` is used (Node `DatabaseSync`).
- Redact secrets from `params` before writing events if logs are retained.

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

- Only query: `SELECT * FROM "<table>" WHERE "<keyColumn>" = ? LIMIT 2` with `String(keyValue)` bound.
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
| Four falsifiable step outcomes + duplicates / unknown tool / dup seq / malformed line | Yes — `npm test` | — |
| Framework-agnostic capture | Yes — NDJSON contract + examples | Integration list / adapters |
| Manual verification steps ↓, time-to-confirm ↓, trust / re-runs | No | Metrics & study (define counters in ops) |

**Engineering MVP “solved”:** `npm test` passes; CLI obeys exit codes; contracts match this document.

## Examples

See [`examples/`](../examples/): `seed.sql`, `tools.json`, `events.ndjson`. Build a DB file:

```bash
node --input-type=module -e "import { DatabaseSync } from 'node:sqlite'; import fs from 'node:fs'; const db=new DatabaseSync('examples/demo.db'); db.exec(fs.readFileSync('examples/seed.sql','utf8')); db.close();"
node dist/cli.js --workflow-id wf_complete --events examples/events.ndjson --registry examples/tools.json --db examples/demo.db
```

(Node may print an experimental warning for `node:sqlite` depending on version.)
