# Quick Verify — normative specification

**Spec id:** `quick-verify-spec` **version:** `1.0.0`

*Source: plan Appendix A (canonical).*

## A.1 CLI grammar

Tokens: `verify-workflow quick --input <path> (--postgres-url <url> | --db <sqlitePath>) --export-registry <path>` with optional `--emit-events <path>` and `--workflow-id <id>` (default `quick-verify`). `-` input = stdin. Missing flag or both DB flags = phase A.

## A.2 Phase A / B

- **Phase A:** exit 3, stderr single JSON [`schemas/cli-error-envelope.schema.json`](../schemas/cli-error-envelope.schema.json), **no stdout bytes**.
- **Phase B:** after successful registry atomic write and read-back (see **Registry file and canonical JSON** below), optionally atomic-write **`--emit-events`** (may be **zero bytes** when there are no exported row tools), then emit one stdout line: `stableStringify(report) + "\n"`, schema-valid; exit 0/1/2.

## A.3 Registry file and canonical JSON

**Shape.** `--export-registry` file contains **only** a UTF-8 JSON **array** (possibly `[]`) of objects each satisfying Advanced [`schemas/tools-registry.schema.json`](../schemas/tools-registry.schema.json) `items` shape for a single entry (the file is **not** wrapped with `{ "tools": [...] }`).

**Canonical bytes.** Define **`canonicalToolsArrayUtf8(tools: object[]): string`**:

- Serialize the array with **`stableStringify`**: recursively, every JSON object has keys sorted by UTF-16 code unit lexicographic order (same comparator as `compareUtf16Id` in `src/resolveExpectation.ts`); arrays keep **implementation order** (see **Tool order**). No ASCII space after `:` or `,`. No trailing newline after the closing `]` of the top-level array.
- Output string is Unicode code points; encode as **UTF-8 without BOM** for disk.

**Identity with stdout.** Let `F` = filesystem contents of `--export-registry` after successful run. Let `T` = `report.exportableRegistry.tools` (array) from stdout JSON. **Required:** `F === canonicalToolsArrayUtf8(T)` as strings (UTF-8 decode of `F` equals the canonical string).

**Tool order in array.** Sort exported tools by `toolId` ascending UTF-16 order.

**Atomic write (phase B ordering).**

1. Build complete `QuickVerifyReport` in memory (including final `exportableRegistry.tools`).
2. Compute `registryUtf8 = canonicalToolsArrayUtf8(report.exportableRegistry.tools)`.
3. **`atomicWriteUtf8File(exportRegistryPath, registryUtf8)`:** `mkdirSync(dirname(exportRegistryPath), { recursive: true })`; write to `exportRegistryPath + ".tmp." + randomSuffix` in same directory; `fsyncSync`; `renameSync` to final path; `readFileSync(exportRegistryPath, "utf8")` must **strict-equal** `registryUtf8`; else phase A.
4. If **`--emit-events <path>`** is present: `atomicWriteUtf8File(emitEventsPath, eventsUtf8)` where `eventsUtf8` is UTF-8 NDJSON (`schemaVersion: 1` `tool_observed` lines for each exported row tool, `seq` in sorted-`toolId` order) or the **empty string** (final file length **0**) when there are no exported row tools.
5. Serialize `reportUtf8 = stableStringify(report) + "\n"`.
6. `process.stdout.write(reportUtf8)`.

**Never** emit any stdout byte before step 3 completes successfully.

## A.3a Human stderr (anchors)

**Not an integration contract** except for three lines, in order, as whole lines:

1. `=== quick-verify human report ===`
2. `Verdict: pass` or `Verdict: fail` or `Verdict: uncertain` (matches rollup)
3. `=== end quick-verify human report ===`

Additional prose after line 3 may change without bumping `quickVerifyVersion`. Integrators must use **stdout JSON** and **exit codes** for automation.

## Appendix H — Human copy identifiers (normative names only)

English text for ingest lines and unit hints is defined in **`src/quickVerify/quickVerifyHumanCopy.ts`**. Identifiers include at least: `MSG_NO_TOOL_CALLS`, `HUMAN_REPORT_BEGIN`, `HUMAN_REPORT_END`, `verdictLine`, `humanLineForIngestReasonCode`, `humanFragmentForReasonCode`. Do not duplicate the strings in this doc.

---

Documentation authority (which markdown owns product vs algorithms): see **[verification-product-ssot.md](verification-product-ssot.md)**.

## A.4 Verdict rollup

- `fail` if any unit `fail`.
- Else `pass` if at least one unit and all `verified`.
- Else `uncertain`.

## A.5 Ingest ladder (ordered)

Constants: `MAX_INPUT_BYTES = 8_388_608`, `MAX_ACTIONS = 50`.

L0: Reject input byte length > `MAX_INPUT_BYTES` → phase B, `ingest.reasonCodes = [INGEST_INPUT_TOO_LARGE]`.

L1: Strip UTF-8 BOM if present.

L2: Try `JSON.parse` entire buffer as value `root`; run **extractActions(root)**; if **≥1** action, ladder **stops** (do not run L3–L4). If parse succeeds but **0** actions, **continue** to L3. If parse **throws**, **continue** to L3.

L3: Split buffer by `\n` (keep line endings out); for each non-empty line, `JSON.parse(line)`; each success → extractActions on that value; collect. If **≥1** action total, **stop**.

L4: Scan for balanced `{`…`}` substrings (greedy outermost scan, no nesting cross-capture); each substring `JSON.parse` → extractActions. If **≥1** action, **stop**.

L5: If zero actions after L2–L4: phase B, `verdict=uncertain`, append **`INGEST_NO_ACTIONS` once** to `ingest.reasonCodes` **after** any `MALFORMED_LINE` entries from L3 (final order: all `MALFORMED_LINE` in encounter order, then `INGEST_NO_ACTIONS`).

**Malformed line in L3:** increment `ingest.malformedLineCount`, append `MALFORMED_LINE` to `ingest.reasonCodes` **once per failed line** in **encounter order**; continue scanning remaining lines.

## A.6 extractActions(value)

- If `value` is object with `tool_calls` array: for each element `c` of `tool_calls` (max `MAX_ACTIONS` total across entire run), recursively `extractActions(c)`.
- If `value` is object: if it has tool name key (first hit in order `toolId`, `tool`, `name`, `function.name`, `action`), build one action: `toolName` = string at that key; `params` = first of `params`|`arguments`|`input` if object, else shallow copy of own keys excluding tool-name keys and `tool_calls`; emit **one** action.
- If `value` is array: run `extractActions` on each element until `MAX_ACTIONS` reached; if exceeded, phase B `uncertain`, append `INGEST_ACTION_CAP` once to `ingest.reasonCodes` and **stop** adding.

## A.7 Flatten (per action)

DFS; `maxDepth=6`, `maxNodes=500` per action. Dot-path keys; arrays: only index into **object** elements `[i]`; primitives in arrays → **skip** primitive arrays for expansion (no paths). Cycles: replace with `null`. Output: flat map path → scalar (string|number|boolean|null).

## A.8 Dedupe

`actionKey = stableStringify({ toolName, flat })` with sorted object keys UTF-16. Keep first action per key; later duplicates: push warning `{ code: DEDUPE_DROPPED, actionKey }` only (no second unit).

## A.9 Decomposition (row buckets + fallback + relational)

**A.9.1 Table variants.** For each catalog table name `T` (exact identifier from catalog):

- `V0 = T`
- `V1 =` lowercase ASCII fold of `V0` (only `A-Z` → `a-z`)
- `V2 = englishSingular(V1)` defined: if ends `ies` and length≥4 → replace trailing `ies` with `y`; else if ends `ses` or `xes` or `ches` or `shes` → strip last `es`; else if ends `s` and not `ss` → strip last `s`; else unchanged
- `V3 = englishPlural(V1)` defined: if ends `y` and prev char not vowel → strip `y` + `ies`; else if ends `s` → unchanged; else append `s`

`variants(T) = unique([V0,V1,V2,V3])` string compare UTF-16.

**A.9.2 Tool tokens.** `tokens(toolName) =` split on `/[^a-zA-Z0-9]+/`, filter empty, map lowercase.

**A.9.3 Table score for action.** `tableScore(A,T) = max over t in tokens(A.toolName), v in variants(T) of`: exact `t===v` → 1.0; `t includes v or v includes t` → 0.75; Levenshtein ratio ≥0.85 → 0.7; else 0.

**A.9.4 Path primary segment.** For flat path `p`, `seg0 =` substring before first `.` if any, else `p` (full path if no dot).

**A.9.5 Segment–table score.** Let `s =` ASCII-lowercase of `seg0` (only `A-Z` → `a-z`). For catalog table `T`, `score_p(T) = max over v in variants(T) of tokenMatchScore(s, v)` where `tokenMatchScore(s, v)` is: `s === v` → 1.0; else if `s.includes(v) || v.includes(s)` → 0.75; else Levenshtein ratio of `s` and `v` ≥ 0.85 → 0.7; else 0.

**A.9.6 Assign path to bucket.** Let `W = argmax_T score_p(T)` over all user tables. If `score_p(W) < T_TABLE` (0.60), assign `p` to **fallback bucket** `__global__`. **Tie-break** when two or more tables share the same top score: choose the table whose name is **smallest UTF-16**; if still tied, choose **smallest UTF-16** among `variants(T)` matched at that score (lexicographic on variant string).

**A.9.7 Row units.** One row unit per **non-empty** bucket of paths (including `__global__`). **Column-side keys:** for path `p` in bucket for table `W`: if `p` contains `.` and `p` is **not** in `__global__`, mapping key = substring after first `.`; otherwise mapping key = full `p`.

For **`__global__`** bucket only: target table for the row unit = `argmax_T tableScore(A,T)` with same tie-break as A.9.6 on table names; if best score `< T_TABLE`, unit is `uncertain` with `MAPPING_LOW_CONFIDENCE`.

**A.9.8 Relational units.** After row units for an action, for each FK edge (childTable, childCols → parentTable, parentCols) from catalog: if flat map contains mappable scalars for all child cols and parent cols with column score ≥ `T_COL` (0.50), emit one `related_exists` unit (SQL shape per [`relational-verification.md`](relational-verification.md) `related_exists`). Cap **20** total units per run; if exceeded, `UNIT_CAP_EXCEEDED` once on report header and **omit** further units.

## A.10 Mapping and export merge

Column scoring: precedence max of exact 1.0, case-fold 0.95, snake/camel normalize 0.90, strip `Id`/`_id` 0.85, Levenshtein≥0.80 → ratio.

Ambiguity: top two `(table,binding)` overall scores `S1,S2`; if `S1 < T_OVERALL` (0.55) → `MAPPING_LOW_CONFIDENCE`; if `S1-S2 ≤ T_AMBIGUITY_DELTA` (0.08) → `MAPPING_AMBIGUOUS` with **exactly two** alternates listed UTF-16 order.

Identity: PK columns first; else unique constraint with fewest columns; tie UTF-16 table name; else `MAPPING_NO_UNIQUE_KEY`.

**Export:** `exportableRegistry.tools` entries sorted by `toolId` UTF-16. Each exported entry’s `toolId` MUST be unique: default `quick:${unitId}` where `unitId` is report `units[].unitId` in UTF-16 order; if a collision still occurs, suffix `:${n}` incrementing `n` from 1. **`effectDescriptionTemplate`** is per unit; one registry entry per exported unit.

## A.11 Constants

`T_TABLE=0.60`, `T_COL=0.50`, `T_OVERALL=0.55`, `T_AMBIGUITY_DELTA=0.08`, `T_EXPORT=0.55`.

## A.12 Row and relational verification

Row: SELECT LIMIT 2; 0 rows `ROW_ABSENT`; ≥2 `DUPLICATE_ROWS`; else scalar compare `verificationScalarsEqual` from `src/valueVerification.ts`. Relational: `RELATED_ROWS_ABSENT` on false EXISTS.

## A.13 Scope string (fixed)

Report `scope.quickVerifyVersion` = `1.0.0`; `scope.capabilities` = fixed enum array `["inferred_row","inferred_related_exists"]` only.

Report `verificationMode` is always **`inferred`**. Per-unit `sourceAction` and `contractEligible` and merged row `verification` fields are defined only in [`schemas/quick-verify-report.schema.json`](../schemas/quick-verify-report.schema.json)—do not restate here.
