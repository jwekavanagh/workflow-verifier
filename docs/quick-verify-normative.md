# Quick Verify — normative specification

**Spec id:** `quick-verify-spec` **version:** `1.1.0`

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

Lines 4–5 after the anchors are **fixed banner** strings exported as `QUICK_VERIFY_BANNER_LINE_1` and `QUICK_VERIFY_BANNER_LINE_2` from **`src/quickVerify/formatQuickVerifyHumanReport.ts`**. Additional prose after those lines may change without bumping `quickVerifyVersion`. Integrators must use **stdout JSON** and **exit codes** for automation.

## Appendix H — Human copy identifiers (normative names only)

English text for ingest lines and unit reason hints is defined in **`src/quickVerify/quickVerifyHumanCopy.ts`** (ingest messages and imports from **`src/verificationUserPhrases.ts`**). Banner lines: **`src/quickVerify/formatQuickVerifyHumanReport.ts`**. Identifiers include at least: `MSG_NO_TOOL_CALLS`, `MSG_NO_STRUCTURED_TOOL_ACTIVITY`, `HUMAN_REPORT_BEGIN`, `HUMAN_REPORT_END`, `QUICK_VERIFY_BANNER_LINE_1`, `QUICK_VERIFY_BANNER_LINE_2`, `verdictLine`, `humanLineForIngestReasonCode`, `humanFragmentForReasonCode`. Do not duplicate the strings in this doc outside a fenced block that cites one of those file paths.

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

L1b: Remove all CSI ANSI sequences from the **whole buffer** using ECMAScript regex `/\u001b\[[\d;?]*[\s-/]*[@-~]/g` (no OSC / other families in this spec version).

**Early empty:** If `buffer.trim().length === 0` after L1–L1b → return zero actions, `ingest.reasonCodes = [INGEST_NO_ACTIONS]`, `malformedLineCount = 0`.

L2: Try `JSON.parse` entire buffer as value `root`; run **extractActions(root)**; if **≥1** action, ladder **stops** (do not run L3–L4). If parse succeeds but **0** actions, **continue** to L3. If parse **throws**, **continue** to L3.

L3: Split buffer by `\n`. For each line with non-empty `trim(line)`:

- Let `s1` = `line.trim()` with at most one leading match removed for **P1** `/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\s+/`, then trim.
- Try `JSON.parse(s1)`; on success → **extractActions** and continue to next line.
- Else if `s1` matches **P2** `/^(?:DEBUG|INFO|WARN|WARNING|ERROR|TRACE)\s+/i`, let `s2` = `s1` with one P2 prefix removed, trim; try `JSON.parse(s2)`; on success → **extractActions**.
- Else if `s1` matches **P3** `/^\[[^\]]{1,64}\]\s+/`, let `s3` = `s1` with one P3 prefix removed, trim; try `JSON.parse(s3)`; on success → **extractActions**.
- Else: increment `malformedLineCount`; append **`MALFORMED_LINE`** to the **internal** L3 list (see mixed-stream rule below).

If **≥1** action total from L3, **stop** L3–L4 and return with **mixed-stream rule** applied to `ingest.reasonCodes`.

L4: Scan for balanced `{`…`}` substrings (greedy outermost scan, no nesting cross-capture); each substring `JSON.parse` → extractActions. If **≥1** action, **stop** (apply mixed-stream rule to `ingest.reasonCodes`).

L5: If zero actions after L2–L4: phase B, `verdict=uncertain`, append **`MALFORMED_LINE` once per failed L3 line** in encounter order, then **exactly one** terminal ingest code:

- **`INGEST_NO_ACTIONS`** only when the buffer was whitespace-only (handled at **Early empty**; this terminal is not combined with `MALFORMED_LINE`).
- **`INGEST_NO_STRUCTURED_TOOL_ACTIVITY`** when the buffer was **non-empty** after trim but zero actions were extracted.

**Mixed stream:** If the final action count is **≥1**, `ingest.reasonCodes` must contain **no** `MALFORMED_LINE` entries; `malformedLineCount` still reflects the count of L3 lines that failed parse after salvage.

## A.6 extractActions(value)

- If `value` is object with `tool_calls` array: for each element `c` of `tool_calls` (max `MAX_ACTIONS` total across entire run), recursively `extractActions(c)`.
- If `value` is object: if it has tool name key (first hit in order `toolId`, `tool`, `name`, `function.name`, `action`), build one action: `toolName` = string at that key; `params` = **param bag** from the first of `params`|`arguments`|`input` in order: if value is a non-array object use it; if value is a string whose trim starts with `{` or `[`, `JSON.parse` in try/catch and if the result is a plain non-null object use it; otherwise shallow copy of own keys excluding tool-name keys and `tool_calls`; emit **one** action.
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

Report `scope.quickVerifyVersion` = `1.1.0`; `scope.capabilities` = fixed enum array `["inferred_row","inferred_related_exists"]`; `scope.ingestContract` = `structured_tool_activity`; `scope.groundTruth` = `read_only_sql`; `scope.limitations` = fixed tuple  
`["quick_verify_inferred_row_and_related_exists_only","no_multi_effect_contract","no_destructive_or_forbidden_row_contract","contract_replay_export_row_tools_only"]` (see schema).

Report `verificationMode` is always **`inferred`**. Per-unit `sourceAction` and `contractEligible` and merged row `verification` fields are defined only in [`schemas/quick-verify-report.schema.json`](../schemas/quick-verify-report.schema.json)—do not restate here.
