# Relational verification (`sql_relational`) — normative contract

This document is the **sole normative behavioral contract** for tools-registry verification kind **`sql_relational`**. JSON Schemas under `schemas/` define **structure** only; they are **structural-only** and not normative for runtime semantics.

Runtime semantics for **row** verification — **`sql_row`**, **`sql_effects`**, and **`sql_row_absent`** (composite **`identityEq`**, negative existence, eventual absence, `ROW_PRESENT_WHEN_FORBIDDEN`, `FORBIDDEN_ROWS_STILL_PRESENT_WITHIN_WINDOW`, row-level `sampleRows`) — are defined **only** in [`execution-truth-layer.md`](execution-truth-layer.md). This file does **not** restate those behaviors; use that document for row-level SQL and outcomes.

The following **`checkKind`** values are normative here: **`related_exists`**, **`aggregate`**, **`join_count`**, **`anti_join`**.

## Overview

`sql_relational` runs one or more **read-only**, **parameterized** SQL checks per `tool_observed` step. Multi-check steps use the **same** rollup status rules and **`MULTI_EFFECT_*`** reason codes as **`sql_effects`**. Eventual consistency mode uses the **same** `pending_all_missing` classification and uncertain codes as **`sql_effects`**.

## Check kinds

### `related_exists`

- **SQL (only allowed shape):** `SELECT EXISTS (SELECT 1 FROM "childTable" WHERE <conjuncts> LIMIT 1) AS v` where `<conjuncts>` is the **AND** of `"childTable"."col" = ?` for each entry in resolved **`matchEq`** (non-empty array; unique column names; columns sorted by UTF-16 `localeCompare` for deterministic parameter order, same as row **`identityEq`**).
- **Bindings (order):** one placeholder per **`matchEq`** entry, in **sorted column order** (implementation aligns with `relationalInvariant.ts` / `buildRelationalScalarSql`).
- **Actual:** column `v` (lowercased); boolean or `0`/`1` only → normalized to `0` or `1`. Anything else → `incomplete_verification`, code **`RELATIONAL_SCALAR_UNUSABLE`**.
- **Pass:** actual `=== 1` → `verified`.
- **Fail:** actual `=== 0` → `missing`, code **`RELATED_ROWS_ABSENT`**.

### `aggregate`

- **COUNT:** `SELECT COUNT(*) AS v FROM "table" [WHERE col = ? AND ...]`
- **SUM:** `SELECT COALESCE(SUM("col"), 0) AS v FROM "table" [WHERE ...]`
- **WHERE:** conjunction of **equality** only (`col = ?`).
- **Compare:** `expect.op` is `eq`, `gte`, or `lte`; `expect.value` is a **finite JSON number** (const or pointer to `typeof number`).

### `join_count`

- **SQL:** `SELECT COUNT(*) AS v FROM "leftTable" AS L INNER JOIN "rightTable" AS R ON L."<leftJoinColumn>" = R."<rightJoinColumn>" [WHERE ...]` (resolved from registry **`join.leftColumn`** / **`join.rightColumn`**).
- **Filters:** equality on left or right table columns only (`whereEq` with **`tableSide`** `left` | `right`).
- **Compare:** same as aggregate.

### `anti_join`

Single **LEFT JOIN** between **two** tables (anchor and lookup). Detects **orphan** anchor rows: rows on the anchor side with **no** matching lookup row under the join condition and optional lookup-side equalities in the **`ON`** clause, plus optional anchor-side equalities in **`WHERE`**.

- **SQL:** `SELECT COUNT(*) AS v FROM "anchorTable" AS A LEFT JOIN "lookupTable" AS L ON A."anchorColumn" = L."lookupColumn" AND <lookup filter conjuncts> WHERE L."lookupPresenceColumn" IS NULL AND <anchor filter conjuncts>`
- **ON clause conjuncts:** join equality, then **`filterEqLookup`** entries in **registry array order** (each `L."col" = ?`).
- **WHERE clause conjuncts:** `L."lookupPresenceColumn" IS NULL` first, then **`filterEqAnchor`** entries in **registry array order** (each `A."col" = ?`).
- **Pass:** count `=== 0` → `verified`.
- **Fail:** count `≥ 1` → `inconsistent`, code **`ORPHAN_ROW_DETECTED`**, **`evidenceSummary.orphanRowCount`** set. **`evidenceSummary.sampleRows`** is **always** populated on this path: second read-only **`SELECT`** of anchor columns referenced in the join (**`anchorColumn`**) plus columns named in **`filterEqAnchor`**, same orphan predicate, **`LIMIT 3`**, array length **`min(count, 3)`** (same constant as row absent samples in `reconciler.ts`).

### Per-check outcomes (aggregate / join_count / anti_join)

| Situation | status | reason.code |
|-----------|--------|-------------|
| DB error | `incomplete_verification` | `CONNECTOR_ERROR` |
| Unusable scalar | `incomplete_verification` | `RELATIONAL_SCALAR_UNUSABLE` |
| Compare fails (including join count `0` when expectation requires non-zero) | `inconsistent` | **`RELATIONAL_EXPECTATION_MISMATCH`** |
| `anti_join` orphans (count ≥ 1) | `inconsistent` | **`ORPHAN_ROW_DETECTED`** |
| Compare passes / `anti_join` zero orphans | `verified` | _(none)_ |

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
- **`ORPHAN_ROW_DETECTED`** — `anti_join` found ≥ 1 orphan anchor row.

Rollup and eventual codes reuse existing **`MULTI_EFFECT_*`**, **`ROW_NOT_OBSERVED_WITHIN_WINDOW`**, **`MULTI_EFFECT_UNCERTAIN_WITHIN_WINDOW`**.

## Invariant cookbook (product vocabulary)

Use this table to map **product** invariant names to registry **`checkKind`** shapes. JSON patterns for integrators: see [`examples/templates/registry-sql-relational.json`](../examples/templates/registry-sql-relational.json) (tools **`example.sql_relational`** and **`example.sql_relational_sum`**).

| Product term | Registry (`checkKind` + fields) | Failure when condition false (step status / code) |
|--------------|----------------------------------|-----------------------------------------------------|
| **exists_related** | `related_exists`: `childTable`, **`matchEq`** (non-empty AND list on child) | `missing` / **`RELATED_ROWS_ABSENT`** |
| **composite_exists_related** | `related_exists` with **multiple** `matchEq` entries (e.g. tenant + foreign key) | `missing` / **`RELATED_ROWS_ABSENT`** when any conjunct fails |
| **orphan_rows / anti_join** | `anti_join`: `anchorTable`, `lookupTable`, `anchorColumn`, `lookupColumn`, **`lookupPresenceColumn`**, optional `filterEqAnchor`, `filterEqLookup` | `inconsistent` / **`ORPHAN_ROW_DETECTED`** |
| **count_equals** | `aggregate`: `fn: COUNT_STAR`, `expect.op: eq`, `expect.value`, optional `whereEq` | `inconsistent` / **`RELATIONAL_EXPECTATION_MISMATCH`** |
| **count_gte** | `aggregate`: `fn: COUNT_STAR`, `expect.op: gte`, `expect.value`, optional `whereEq` | `inconsistent` / **`RELATIONAL_EXPECTATION_MISMATCH`** |
| **aggregate_match (SUM)** | `aggregate`: `fn: SUM`, `sumColumn`, `expect`, optional `whereEq` — see template tool **`example.sql_relational_sum`** | `inconsistent` / **`RELATIONAL_EXPECTATION_MISMATCH`** |
| **join_cardinality** | `join_count`: `leftTable`, `rightTable`, `join`, `expect`, optional `whereEq` on `left` / `right` | `inconsistent` / **`RELATIONAL_EXPECTATION_MISMATCH`** |

When a row **could** be expressed as either **`related_exists`** or **`aggregate`** with `COUNT_STAR` and `expect.op: gte` / `eq`, prefer **`related_exists`** if you need a **missing** row interpretation (**`RELATED_ROWS_ABSENT`**) when no child row matches; use **`aggregate`** when a numeric count comparison (including zero) should yield **`RELATIONAL_EXPECTATION_MISMATCH`**.

Row **must not exist** claims belong to **`sql_row_absent`** in the tool registry, not to **`sql_relational`** — see [`execution-truth-layer.md`](execution-truth-layer.md).

## Non-goals

- No raw SQL strings in the registry.
- No multi-hop join graphs; **`anti_join`** is exactly **one** `LEFT JOIN` between **two** tables.
- No `OR`, ranges, or arbitrary boolean trees—only **AND** of **column = value** (plus the fixed join skeletons for `join_count` and `anti_join`).
- Subqueries beyond the fixed shapes above are not allowed as author input.
