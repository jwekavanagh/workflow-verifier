# Relational verification (`sql_relational`) — normative contract

This document is the **sole normative behavioral contract** for tools-registry verification kind **`sql_relational`**. JSON Schemas under `schemas/` define **structure** only; they are **structural-only** and not normative for runtime semantics.

## Overview

`sql_relational` runs one or more **read-only**, **parameterized** SQL checks per `tool_observed` step. Multi-check steps use the **same** rollup status rules and **`MULTI_EFFECT_*`** reason codes as **`sql_effects`**. Eventual consistency mode uses the **same** `pending_all_missing` classification and uncertain codes as **`sql_effects`**.

## Check kinds

### `related_exists`

- **SQL (only allowed shape):** `SELECT EXISTS (SELECT 1 FROM "childTable" WHERE "childTable"."fkColumn" = ? [AND "childTable"."col_i" = ? ...] LIMIT 1) AS v`
- **Optional `whereEq`:** same equality-only `column` / `value` entries as `aggregate.whereEq` (conjunction on the **child** table). Omitted in the registry resolves to an empty conjunction (FK predicate only).
- **Bindings (order):** `fkValue` first (string-coerced like row key resolution), then `whereEq` values in **registry array order**.
- **Actual:** column `v` (lowercased); boolean or `0`/`1` only → normalized to `0` or `1`. Anything else → `incomplete_verification`, code **`RELATIONAL_SCALAR_UNUSABLE`**.
- **Pass:** actual `=== 1` → `verified`.
- **Fail:** actual `=== 0` → `missing`, code **`RELATED_ROWS_ABSENT`**.

### `aggregate`

- **COUNT:** `SELECT COUNT(*) AS v FROM "table" [WHERE col = ? AND ...]`
- **SUM:** `SELECT COALESCE(SUM("col"), 0) AS v FROM "table" [WHERE ...]`
- **WHERE:** conjunction of **equality** only (`col = ?`).
- **Compare:** `expect.op` is `eq`, `gte`, or `lte`; `expect.value` is a **finite JSON number** (const or pointer to `typeof number`).

### `join_count`

- **SQL:** `SELECT COUNT(*) AS v FROM "leftTable" INNER JOIN "rightTable" ON "L"."leftCol" = "R"."rightCol" [WHERE ...]`
- **Filters:** equality on left or right table columns only.
- **Compare:** same as aggregate.

### Per-check outcomes (aggregate / join_count)

| Situation | status | reason.code |
|-----------|--------|-------------|
| DB error | `incomplete_verification` | `CONNECTOR_ERROR` |
| Unusable scalar | `incomplete_verification` | `RELATIONAL_SCALAR_UNUSABLE` |
| Compare fails (including join count `0` when expectation requires non-zero) | `inconsistent` | **`RELATIONAL_EXPECTATION_MISMATCH`** |
| Compare passes | `verified` | _(none)_ |

## Numeric contract

- **Expected:** `const` must be finite JSON `number`; `pointer` target must be `typeof number` and `Number.isFinite`. No stringly numbers.
- **Actual:** finite `number`, or `bigint` within safe integer range (converted), or EXISTS path as above. Otherwise **`RELATIONAL_SCALAR_UNUSABLE`**.
- **Comparison:** IEEE-754 `===` for `eq`; `gte` / `lte` on the same numeric values.

## Duplicate check IDs

- **Resolver:** duplicate `id` in `checks[]` → `DUPLICATE_EFFECT_ID` (same code as duplicate effect ids).
- **Structural validation:** duplicate `checks[].id` on a tool → structural issue **`sql_relational_duplicate_check_id`**.

## Multi-check rollup

Identical decision tree to `sql_effects` (`multiEffectRollup` lines 66–109): incomplete any → **`MULTI_EFFECT_INCOMPLETE`**; all verified → verified; no verified → **`MULTI_EFFECT_ALL_FAILED`**; else **`MULTI_EFFECT_PARTIAL`**. **`evidenceSummary`** uses **`effectCount`** and **`effects`** (same keys as `sql_effects`).

## Reason codes (relational)

- **`RELATED_ROWS_ABSENT`** — `related_exists` false.
- **`RELATIONAL_EXPECTATION_MISMATCH`** — aggregate/join_count comparison failed.
- **`RELATIONAL_SCALAR_UNUSABLE`** — non-numeric or out-of-range actual where a scalar was required.

Rollup and eventual codes reuse existing **`MULTI_EFFECT_*`**, **`ROW_NOT_OBSERVED_WITHIN_WINDOW`**, **`MULTI_EFFECT_UNCERTAIN_WITHIN_WINDOW`**.

## Invariant cookbook (product vocabulary)

Use this table to map **product** invariant names to registry **`checkKind`** shapes. JSON patterns for integrators: see [`examples/templates/registry-sql-relational.json`](../examples/templates/registry-sql-relational.json) (tools **`example.sql_relational`** and **`example.sql_relational_sum`**).

| Product term | Registry (`checkKind` + fields) | Failure when condition false (step status / code) |
|--------------|----------------------------------|-----------------------------------------------------|
| **exists_related** | `related_exists`: `childTable`, `fkColumn`, `fkValue`, optional `whereEq` (equality on child) | `missing` / **`RELATED_ROWS_ABSENT`** |
| **count_equals** | `aggregate`: `fn: COUNT_STAR`, `expect.op: eq`, `expect.value`, optional `whereEq` | `inconsistent` / **`RELATIONAL_EXPECTATION_MISMATCH`** |
| **count_gte** | `aggregate`: `fn: COUNT_STAR`, `expect.op: gte`, `expect.value`, optional `whereEq` | `inconsistent` / **`RELATIONAL_EXPECTATION_MISMATCH`** |
| **aggregate_match (SUM)** | `aggregate`: `fn: SUM`, `sumColumn`, `expect`, optional `whereEq` — see template tool **`example.sql_relational_sum`** | `inconsistent` / **`RELATIONAL_EXPECTATION_MISMATCH`** |
| **join_cardinality** | `join_count`: `leftTable`, `rightTable`, `join`, `expect`, optional `whereEq` on `left` / `right` | `inconsistent` / **`RELATIONAL_EXPECTATION_MISMATCH`** |

When a row **could** be expressed as either **`related_exists`** (including `whereEq`) or **`aggregate`** with `COUNT_STAR` and `expect.op: gte` / `eq`, prefer **`related_exists`** if you need a **missing** row interpretation (**`RELATED_ROWS_ABSENT`**) when no child row matches; use **`aggregate`** when a numeric count comparison (including zero) should yield **`RELATIONAL_EXPECTATION_MISMATCH`**.

## Non-goals

- No raw SQL strings in the registry.
- No `LEFT`/`RIGHT`/`FULL` joins or subqueries beyond the fixed shapes above. Extra predicates are **only** structured **`whereEq`** equalities on allowed columns (no `OR`, no inequality operators in `whereEq`).
