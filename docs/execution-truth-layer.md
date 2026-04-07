# Execution Truth Layer (MVP) — Single Source of Truth

This document is the authoritative specification for the MVP. The product verifies **external SQL state** against expectations derived from **observed tool calls** and a **tool registry**, never from agent-reported success alone.

## Why this shape

- **NDJSON events**: One line per tool invocation provides a concrete “observe each step” capture surface that any agent stack can implement by appending JSON after each tool call.
- **Tool registry (`tools.json`)**: Keeps “intent → expected state” inside the product using RFC 6901 JSON Pointers into `params`, so events do not carry caller-supplied expectation blobs.
- **SQLite via `node:sqlite`**: Read-only `SELECT` against a file path gives reproducible ground truth in CI. The reference plan named `better-sqlite3`; this repo uses Node’s built-in module (**Node ≥ 22.13**) to avoid native compilation on constrained environments while preserving the same reconciliation rules as Postgres (see [SQL connector contract](#sql-connector-contract)).
- **Postgres via `pg` (batch/CLI only)**: `verifyWorkflow` can target PostgreSQL using a single `pg.Client` per run, session read-only guards (`applyPostgresVerificationSessionGuards`), then verification `SELECT`s only. The in-process hook does **not** use Postgres (see [Postgres verification (batch and CLI)](#postgres-verification-batch-and-cli)).

## Product requirements: outcome verification

This subsection maps **outcome verification** product acceptance criteria to this MVP’s emitted artifacts. **Structural SSOT** remains [`schemas/workflow-result.schema.json`](../schemas/workflow-result.schema.json) and [`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json); do not treat the bullets below as a second field catalog.

| Acceptance theme | Where it appears in the product |
|------------------|----------------------------------|
| Expected outcome checked against **actual system state** (SQL rows), not an agent success flag | Each logical `tool_observed` step yields a read-only keyed `SELECT` + field checks; results drive `WorkflowResult.steps[].status`, `reasons`, and `evidenceSummary` (see [Reconciler rule table](#reconciler-rule-table-sql_row) and `reconciler.ts`). |
| Expectations come from **registry + params**, not from the event line | [`schemas/event.schema.json`](../schemas/event.schema.json) forbids embedded expectation payloads on events; `resolveExpectation` builds `verificationRequest` from `tools.json` and `tool_observed.params`. |
| **Clear verification result per step** | Machine: `WorkflowResult.steps[]` (`status`, `reasons`, `verificationRequest`, `evidenceSummary`) and `workflowTruthReport.steps[]` (`outcomeLabel`, …). Human: [Human truth report](#human-truth-report) lines `seq=` / `result=` / `reference_code:`. |
| **Not successfully verified** when state does not match | Non-`verified` step statuses (`missing`, `inconsistent`, `incomplete_verification`, `partially_verified`, `uncertain`) with reasons; see [Workflow status](#workflow-status-prd-aligned) rollup. |
| **Absent record** | Typically `ROW_ABSENT` → step `missing` → truth `FAILED_ROW_MISSING`. |
| **Wrong values** | Typically `VALUE_MISMATCH` (and `evidenceSummary.expected` / `actual` / `field`) → step `inconsistent` → truth `FAILED_VALUE_MISMATCH`. |
| **Duplicate rows at key** | `DUPLICATE_ROWS` → step `inconsistent`. |
| **Which step** in a multi-step workflow | `steps[].seq`, `steps[].toolId`; truth report steps align by `seq`. |
| **Partial multi-effect completion** | Registry `sql_effects` (≥2 row checks): step `partially_verified` / `MULTI_EFFECT_PARTIAL` when some effects `verified` and others `missing` or `inconsistent`; `inconsistent` / `MULTI_EFFECT_ALL_FAILED` when all fail; per-effect rows in `WorkflowResult.steps[].evidenceSummary.effects` and `workflowTruthReport.steps[].effects` (each with `outcomeLabel`, `reasons`). Step-level rollup `reasons[0].message` includes a **Per effect:** clause listing `effectId (firstReasonCode)` for each failed effect (see [Step rollup (multi-effect only)](#workflow-result-multi-effect-shape)). Workflow status remains `inconsistent` when any step is `partially_verified` ([Workflow status](#workflow-status-prd-aligned)). Example tool: `crm.upsert_contact_multi` in [`examples/tools.json`](../examples/tools.json). |
| **Actionable verification failure feedback** | **Why / what failed:** `WorkflowResult.steps[].reasons` and per-effect `reasons` in `evidenceSummary.effects`; **human stderr:** `detail:` / `reference_code:` under each step and effect ([Human truth report](#human-truth-report)). **Step + expectation + observation:** `workflowTruthReport.steps[]` has `seq`, `toolId`, `verifyTarget`, `intendedEffect.narrative`, `observedExecution.paramsCanonical`. **Kinds for action:** `outcomeLabel`, `failureDiagnostic` on each non-verified step, `reasons[].code`, plus `workflowTruthReport.failureAnalysis` (`summary`, `primaryOrigin`, `evidence` with `scope` `step` / `effect`, `actionableFailure.category` / `severity`). When the driver step’s first reason is a multi-effect rollup code (`MULTI_EFFECT_*`), `failureAnalysis.summary` (P5) appends a sentence pointing operators to **`workflowTruthReport.steps[].effects`** for authoritative per-effect outcomes. |

**Proof in repo:** Requirement-level black-box tests live in `src/verificationAgainstSystemState.requirements.test.ts` (Vitest), using `verifyWorkflow` and SQLite seeded from `examples/seed.sql` only. Multi-effect and operator-feedback coverage includes tests **H–L** (multi-effect partial / all-fail / all-pass, actionable feedback, human report substrings) and **Negative:** complete workflow `failureAnalysis === null`.

## Workflow verdict and audit

This subsection maps **workflow-level verdict** and **auditable run records** acceptance criteria to this MVP. **Structural SSOT** for emitted JSON is unchanged ([`schemas/workflow-result.schema.json`](../schemas/workflow-result.schema.json), [`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json)). Run-bundle manifests use [`schemas/agent-run-record-v1.schema.json`](../schemas/agent-run-record-v1.schema.json) (**unsigned**) or [`schemas/agent-run-record-v2.schema.json`](../schemas/agent-run-record-v2.schema.json) (**signed**), selected by manifest **`schemaVersion`** (see [Cryptographic signing of workflow-result (normative)](#cryptographic-signing-of-workflow-result-normative)).

| Acceptance theme | Where it appears in the product |
|------------------|----------------------------------|
| **Overall workflow result** after evaluating observed steps | Machine: **`WorkflowResult.status`** (`complete` \| `incomplete` \| `inconsistent`) and **`workflowTruthReport.workflowStatus`** (same value). Human: first **`trust:`** line of the [Human truth report](#human-truth-report). |
| **Verdict reflects step verification outcomes** | `status` is produced only by **`aggregateWorkflow`** from step statuses, run-level reasons, and empty-step rules—see [Workflow status](#workflow-status-prd-aligned). |
| **Distinguish complete vs incomplete vs inconsistent** | The three `WorkflowStatus` values above; CLI exit **0** / **1** / **2** respectively on verdict paths. Debug Console lists **`status`** per run; run detail includes **`workflowVerdictSurface`**. |
| **Verdict supported by step-level evidence** | Authoritative: **`WorkflowResult.steps[]`** and **`workflowTruthReport.steps[]`**. Review helper: **`workflowVerdictSurface`** on **`GET /api/runs/:id`** (ok loads)—`status`, **`trustSummary`** (same string as **`workflowTruthReport.trustSummary`**), **`stepStatusCounts`** (count per `StepStatus`, all keys present). Implemented by **`buildWorkflowVerdictSurface`** in `workflowTruthReport.ts` only—clients must not re-derive. |
| **Preserve execution + verification for a run** | Canonical directory: **`events.ndjson`**, **`workflow-result.json`**, **`agent-run.json`** (SHA-256 manifest). Optional **cryptographic signing** adds **`workflow-result.sig.json`** and manifest **`schemaVersion` `2`** (see [Cryptographic signing](#cryptographic-signing-of-workflow-result-normative)). Writer: **`writeAgentRunBundle`** (CLI **`--write-run-bundle`**, optional **`--sign-ed25519-private-key`**). |
| **Link execution to verification consistently** | **`agent-run.json`** binds **`workflowId`**, artifact relative paths, **`sha256`**, **`byteLength`** for each file—see [Agent run record (canonical bundle)](#agent-run-record-canonical-bundle). |
| **Retrieve and review a past run** | **Programmatic:** **`loadCorpusRun(corpusRoot, runId)`** (package export)—**`loadStatus === "ok"`** yields **`workflowResult`**, **`agentRunRecord`**, **`paths`**. **Interactive:** **`verify-workflow debug --corpus <dir>`** and Debug Console; **`GET /api/runs/:id`** returns **`workflowResult`**, **`workflowVerdictSurface`**, **`executionTrace`**, etc. **Offline:** open **`workflow-result.json`** / **`events.ndjson`** on disk. |
| **Empty `events.ndjson`** | A **zero-byte** `events.ndjson` is valid when the manifest records **`byteLength` 0** and the SHA-256 of the empty buffer. It means “no captured lines in this bundle,” not “workflow succeeded.” |

### Workflow verdict — Engineer

- **`agentRunBundle.ts`**: **`writeAgentRunBundle`** writes each final file via a temp name in the run directory then **rename** into place. Order: **`events.ndjson`** → **`workflow-result.json`** → (when signing) **`workflow-result.sig.json`** → **`agent-run.json`** (manifest last). **Unsigned** path: three finals only (**`schemaVersion` `1`**). **Signed** path: on thrown error after some renames, the implementation **best-effort unlinks** completed finals in **reverse order** (sig → workflow-result → events) for that invocation only, then rethrows—see [Cryptographic signing](#cryptographic-signing-of-workflow-result-normative). On failure mid-write, temp files for the current attempt are removed; **process crash** can still leave an inconsistent directory—only **successful return** guarantees consistency for the signed path.
- **`workflowTruthReport.ts`**: **`buildWorkflowVerdictSurface(WorkflowResult)`** for API/UI only.
- **`pipeline.ts`**: **`withWorkflowVerification`** optional **`persistBundle: { outDir, ed25519PrivateKeyPemPath? }`**. After a successful run, **`captureNdjsonUtf8()`** serializes **`bufferedRunEvents`** in strict **`observeStep` enqueue order** (`JSON.stringify(event) + "\n"` per line), then **`writeAgentRunBundle`** is called with the **final** **`WorkflowResult`** (v13 + truth report). When **`ed25519PrivateKeyPemPath`** is set, the bundle is written as **v2** with a signature sidecar. No bundle is written if **`run`** throws or **`buildWorkflowResult`** fails.

### Workflow verdict — Integrator

- **Preserve:** **`writeAgentRunBundle({ outDir, eventsNdjson, workflowResult, ed25519PrivateKeyPemPath? })`** or CLI **`--write-run-bundle <dir>`** with optional **`--sign-ed25519-private-key <path>`** (`runId` = basename of resolved `outDir`).
- **Retrieve:** **`loadCorpusRun(resolveCorpusRootReal(corpusRoot), runId)`**; treat **`ok`** as the normative “this directory is a consistent bundle.”
- **In-process audit:** pass **`persistBundle`** on **`withWorkflowVerification`**, or build **`eventsNdjson`** yourself and call **`writeAgentRunBundle`** after **`finalizeEmittedWorkflowResult`** (or use the fulfilled **`WorkflowResult`** from the hook).

### Workflow verdict — Operator

- Debug Console run detail shows **workflow status**, **trust summary**, and **non-zero step outcome counts** from **`workflowVerdictSurface`** before raw JSON.
- Do not treat a folder as trusted until **`loadCorpusRun`** returns **`ok`** (or the Debug list shows **`loadStatus` ok**). Tampering yields **`ARTIFACT_INTEGRITY_MISMATCH`** / **`ARTIFACT_LENGTH_MISMATCH`** / **`WORKFLOW_RESULT_*`** as documented under corpus load outcomes.

**Proof in repo:** `src/agentRunBundle.test.ts` (round-trip, empty events, integrity negative, signed round-trip), `src/agentRunBundle.rollback.test.ts` (signed rollback), `src/verifyRunBundleSignature.test.ts`, `src/workflowVerdictSurface.test.ts`, `src/withWorkflowVerification.persistBundle.test.ts`, `src/debugServer.test.ts` (**`workflowVerdictSurface`** on run detail), `test/bundle-signature-*.test.mjs` (fixture, doc codes, CLI signed write).

## Compare runs and independent verification

This subsection maps **multi-run compare**, **reliability/read highlights**, and **independent SQL trust** acceptance criteria to emitted artifacts and the Debug Console. **Structural SSOT** for compare stdout is [`schemas/run-comparison-report.schema.json`](../schemas/run-comparison-report.schema.json) (**`schemaVersion` `4`**). **No** second compare JSON view-model is defined for Debug UI: compare and trust panels are **HTML strings** only on HTTP success paths.

| Acceptance theme | Where it appears in the product |
|------------------|----------------------------------|
| **9.1** Multiple workflow results in one compare | `buildRunComparisonReport` over ordered normalized **`WorkflowResult[]`** (length ≥ 2); CLI **`compare`**; **`POST /api/compare`**. Proof: `src/compare.acceptance.test.ts` **`AC_9_1_multi_run_compare_emits_schema_v4`**. |
| **9.2** Introduced / resolved / recurring highlights | Required **`compareHighlights`** on **`RunComparisonReport` v4**; HTML lists derived only in **`renderComparePanelHtml`**. Proof: **`AC_9_2_compareHighlights_match_fixture`**. |
| **9.3** Review differences in UI | Compare tab assigns **`comparePanelHtml`** to **`innerHTML`** (no browser-side recompute). Proof: `test/debug-ui/ac-9-3.spec.ts` **`AC_9_3_compare_panel_markup`**. |
| **9.4** Reliability headline when window vs pairwise diverge | Required **`reliabilityAssessment`** ( **`headlineVerdict`**, **`headlineRationale`** ); pinned golden `test/fixtures/debug-ui-compare/headline-ac-9-4.json`. Proof: **`AC_9_4_headlineVerdict_window_pairwise_divergence`**. |
| **10.1–10.2** Trust from read-only SQL, not model narrative | `verifyWorkflow` + registry + DB for **`wf_missing`**: **`ROW_ABSENT`**, **`FAILED_ROW_MISSING`**, zero rows. Proof: `src/verificationAgainstSystemState.requirements.test.ts` **`AC_10_1_AC_10_2_independent_sql_evidence_not_execution_narrative`**. |
| **10.3** SQL evidence column in trust table | **`formatSqlEvidenceDetailForTrustPanel`** → **`td[data-etl-field="sql-evidence"]`**; substring drift guard `test/fixtures/debug-ui-compare/expected-strings.json`. Proof: `test/debug-ui/ac-10-3.spec.ts`. |
| **10.4** Execution-path findings vs empty | **`renderRunTrustPanelHtml`**: **`li[data-etl-finding-code]`** vs **`p[data-etl-execution-path-empty]`** (exact copy in **`expected-strings.json`**). Proof: `test/debug-ui/ac-10-4.spec.ts` **`AC_10_4_execution_path`**. |

### Debug API (normative success shapes)

On **`200`** success, JSON bodies **must not** include keys outside the sets below (enforced by `src/debugServer.test.ts`: **`debug_api_POST_compare_200_json_has_exact_keys`**, **`debug_api_GET_run_detail_ok_json_has_exact_keys`**; key order in tests uses `localeCompare` UTF-16 sort).

**`POST /api/compare`** — keys **exactly** (UTF-16 sort order):

`comparePanelHtml`, `humanSummary`, `report`

Types: **`comparePanelHtml`** non-empty string (server HTML from **`renderComparePanelHtml`**), **`humanSummary`** string (**`formatRunComparisonReport`**), **`report`** object (**`RunComparisonReport` v4**, AJV **`run-comparison-report`**).

**`GET /api/runs/:runId`** when **`loadStatus === "ok"`** — keys **exactly** (UTF-16 sort order):

`agentRunRecord`, `capturedAtEffectiveMs`, `executionTrace`, `loadStatus`, `malformedEventLineCount`, `meta`, `paths`, `runId`, `runTrustPanelHtml`, `workflowResult`, `workflowVerdictSurface`

Types: **`runTrustPanelHtml`** non-empty string (from **`renderRunTrustPanelHtml`**). Error loads keep the prior smaller shape (no trust HTML).

### HTML hooks (compare + trust panels)

| Hook | Meaning |
|------|---------|
| **`section[data-etl-section="compare-result"]`** | Compare panel root |
| **`p[data-etl-headline]`** | One line: **`headlineVerdict`** then **`headlineRationale`** (see renderer) |
| **`p[data-etl-window-trend]`**, **`p[data-etl-pairwise-trend]`**, **`p[data-etl-recurrence]`** | Reliability lines |
| **`ul[data-etl-list="introduced\|resolved\|recurring"]`** | Compare highlight lists (may be empty; no placeholder **`li`**) |
| **`section[data-etl-section="run-trust"]`** | Trust panel root |
| **`p[data-etl-verification-basis]`** | Fixed operator line: independent SQL basis (plan-transition runs: git + machine plan rules basis — see [Plan transition validation](#plan-transition-validation-normative)) |
| **`table[data-etl-table="verify-evidence"]`**, **`tr[data-etl-seq]`**, **`td[data-etl-field="sql-evidence"]`** | Step alignment + SQL evidence column |
| **`tr[data-etl-alignment-warning="true"]`** | Truth/engine seq misalignment |
| **`section[data-etl-section="execution-path"]`**, **`p[data-etl-execution-path-empty]`**, **`p[data-etl-execution-path-summary]`**, **`ol[data-etl-list="execution-findings"]`**, **`li[data-etl-finding-code]`** | Execution-path rollup |

### Compare and trust panels — Engineer

- **`debugPanels.ts`**: **`renderComparePanelHtml`**, **`renderRunTrustPanelHtml`**, **`formatSqlEvidenceDetailForTrustPanel`** — sole producers of compare/trust HTML for Debug UI.
- **`runComparison.ts`**: **`buildRunComparisonReport`**, **`formatRunComparisonReport`** (v4 **`reliabilityAssessment`**, **`compareHighlights`**, per-run **`recommendedAction`** / **`automationSafe`**).
- **`debug-ui/app.js`**: assigns **`comparePanelHtml`** / **`runTrustPanelHtml`** to **`innerHTML`** only.

**Drift guard:** `test/fixtures/debug-ui-compare/expected-strings.json` is the only source for Playwright substring assertions (and matching Vitest checks).

## Plan transition validation (normative)

This subsection defines **`verify-workflow plan-transition`**: validate a **git** diff between two commits against **machine-checkable rules** read from the same plan markdown file (**`--plan`**). It does **not** use SQL or the tool registry.

Rules come from **one** of three sources ([Where rules come from](#where-rules-come-from-ordered)); the product **never** interprets arbitrary prose as requirements. **Derived citations** (**`derived_citations`**) collect path-shaped tokens only by deterministic rules implemented in **`planTransitionPathHarvest.ts`** — not NLP and not semantic interpretation of tables or checklist prose.

### Non-goals

- No NLP or free-text “understanding” of **`overview`**, narrative tables, or todo **semantics**.
- No equivalence between `planLogicalSteps` (tool `seq` grouping) and narrative unless the author supplies **`planValidation`**, the body YAML block, or qualifying path citations for **derived required surfaces** (each cited path must appear in the git name-status diff).
- **No fallback:** If there is **exactly one** **`Repository transition validation`** heading, only the body YAML pipeline runs; malformed YAML, wrong fences, or schema errors **do not** fall through to derived citations.

### Where rules come from (ordered)

1. **Front matter `planValidation` key:** If the parsed YAML front matter object **has own property** **`planValidation`**, its value is validated with AJV against [`schemas/plan-validation-core.schema.json`](../schemas/plan-validation-core.schema.json) (object **`schemaVersion` `1`** and **`rules`**). The markdown body is **not** scanned for rules. Duplicate **`Repository transition validation`** headings in the body are ignored in this case.
2. **Else** normalize the plan body after the closing front matter delimiter using **LF** newlines (`\r\n` → `\n`) and count lines matching exactly  
   `^#{1,6}\s+Repository transition validation\s*$`.
   - **>1 match** → **`PLAN_VALIDATION_AMBIGUOUS_BODY_RULES`**. **No** derived citations.
   - **Exactly 1 match** → load rules from the [body YAML section](#body-section-contract-exactly-one-repository-transition-validation-heading) below. **No** derived citations on any error in that pipeline.
   - **0 matches** → [Derived citations](#derived-citations-derived_citations): if **≥1** qualifying path is harvested, emit **N** synthetic **`requireMatchingRow`** rules (**N** = number of sorted unique harvested paths), with **`id`** values **`derived.require.0`** … **`derived.require.N-1`**, **`pattern`** = each path, and **`rowKinds`** = **`add`**, **`modify`**, **`delete`**, **`rename`**, **`copy`**, **`type_change`** (same set for each rule; **`unmerged`** excluded). If **0** paths → **`PLAN_VALIDATION_INSUFFICIENT_SPEC`**.

### Body section contract (exactly one `Repository transition validation` heading)

- Let **`H`** be the heading level (number of `#`). The **section** runs from the line after that heading through the line before the next heading whose level is **≤ `H`**, or to EOF.
- **Fenced blocks** in the section (opening line `^```(\S*)\s*$`, closing line `^```\s*$`, in order):
  - **0 blocks** → **`PLAN_VALIDATION_INSUFFICIENT_SPEC`**.
  - The **first** block’s info string must be exactly **`yaml`** or **`yml`**; otherwise **`PLAN_VALIDATION_INSUFFICIENT_SPEC`** (first fence must be YAML).
  - If **more than one** block has info **`yaml`** or **`yml`** → **`PLAN_VALIDATION_AMBIGUOUS_BODY_RULES`**.
  - Parse the **first** fenced block’s inner text as YAML. YAML parse failure → **`PLAN_VALIDATION_YAML_INVALID`** with message prefix **`body Repository transition validation:`**.
  - Validate the parsed object with **`plan-validation-core`**. Failure → **`PLAN_VALIDATION_SCHEMA_INVALID`** with prefix **`body Repository transition validation:`**.

### Derived citations (`derived_citations`)

**Normative expected outputs (evaluation corpus):** The sorted path arrays the product expects for the five evaluation plans under **`plans/`** are stored only in **[`test/fixtures/plan-derived-citations/expected-harvest.json`](../test/fixtures/plan-derived-citations/expected-harvest.json)**. Do not duplicate those lists in prose here.

**Pipeline** (implemented in **`planTransitionPathHarvest.ts`**; inputs: full plan markdown **`md`**, parsed front matter object **`fm`** for **`todos`** only):

1. Strip a leading UTF-8 BOM from **`md`** if present.
2. **`body`** = markdown after closing front matter delimiter, with **`\r\n` → `\n`**.
3. **Single linear scan** of **`body`** lines (fenced blocks skipped line-by-line: lines inside **`^```(\S*)\s*$`** … **`^```\s*$`** pairs are not harvested). Track **`inObligation`** from **`^##\s+(.+?)\s*$`**: enter when **`title`** matches **`PLAN_TRANSITION_OBLIGATION_H2_TITLE_RE`**, exit when any **`##`** line’s title does not match. Only non-heading lines while **`inObligation`** and **not** inside a fence are processed.
4. **Per obligation line** (full line **`L`**):
   - If **`L`** matches **`PLAN_TRANSITION_REFERENCE_ONLY_LINE_RE`** → skip **`L`**.
   - If the current obligation H2 title matches **`/^testing\b/i`** at its start (trimmed title) **and** **`L`** contains the substring **`Expect:`** → skip **`L`**.
   - Split **`L`** into **fragments** on **`/\.\s+/g`** (period + ASCII whitespace). Trim each fragment; drop empties.
   - For each fragment **`F`**: if **`F`** matches **`PLAN_TRANSITION_REFERENCE_ONLY_LINE_RE`** → skip **`F`**. Else run the **extractors** on **`F`** only. For each normalized qualifying path **`P`**:
     - If **`P`** starts with **`examples/`**, **`docs/`**, **`schemas/`**, or **`plans/`** → keep **`P`** iff **`F`** matches **`PLAN_TRANSITION_STRONG_ACTION_RE`**.
     - If **`P`** starts with **`src/`**, **`test/`**, or **`debug-ui/`** → keep **`P`** iff **`F`** matches **`PLAN_TRANSITION_STRONG_ACTION_RE`** **or** **`PLAN_TRANSITION_NORMATIVE_MODAL_RE`** **or** **`/^\s*\d+\.\s/`** (numbered deliverable fragment).
5. **Todos:** For each **`fm.todos[]`** element with string **`content`**, split **only** on the literal **`"; "`** (semicolon + space). If **`"; "`** never appears, treat the trimmed **`content`** as a single segment. For each non-empty trimmed segment **`S`**, apply the same fragment-level rules as step 4 (reference skip on **`S`**, **no** **`Expect:`** line rule, extractors on **`S`**, same path-prefix gates using **`S`** as the text).
6. **Dedupe** with a set; **sort** UTF-16 string order.

**Exported symbols** (literal regex bodies live in **`planTransitionPathHarvest.ts`**): **`PLAN_TRANSITION_OBLIGATION_H2_TITLE_RE`**, **`PLAN_TRANSITION_REFERENCE_ONLY_LINE_RE`**, **`PLAN_TRANSITION_STRONG_ACTION_RE`** (includes **`wire(?!\s+schema)`** so the English noun phrase “wire schema” does not count as the **`wire`** deliverable verb), **`PLAN_TRANSITION_NORMATIVE_MODAL_RE`**, **`PLAN_TRANSITION_NUMBERED_FRAGMENT_RE`**, **`STRONG_ROOT_PREFIXES`**, **`WEAK_ROOT_PREFIXES`**.

**Obligation H2 title** — applied to **`title`** (trimmed text after **`## `**):

```javascript
const PLAN_TRANSITION_OBLIGATION_H2_TITLE_RE =
  /^(?:.{0,120}?\b)?(implementation|deliverables|testing|documentation|validation)\b(?:\s|[:\u2014\u2013\-]|$)/i;
```

**Reference-only** — applied to a **full obligation line** before fragmentation, and again to each **fragment** / **todo segment**:

```javascript
const PLAN_TRANSITION_REFERENCE_ONLY_LINE_RE =
  /\b(?:same\s+pattern|same\s+shape\s+as|seeded\s+from|required\s+setup|use\s+the\s+same|similar\s+to|mirrors(?:\s+existing)?|for\s+example|hypothetical|chosen\s+in\s+fixture)\b|(?:e\.g\.|i\.e\.)(?=\s|,|$)/i;
```

Abbreviated **`e.g.`** / **`i.e.`** use a lookahead after the final dot because a trailing **`\b`** does not match between **`.`** and following whitespace in JavaScript.

**Extractors (deterministic):**

- **Markdown links** (non-image): `(?<!!)\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)` — candidate = group 2; optional `<` `>` wrapper stripped from ends.
- **Inline backticks:** single-line `` `…` `` where the inner text matches a repo-relative path under allowed roots with an allowed extension (see **`planTransitionPathHarvest.ts`**).

**Normalization:** trim ASCII space/tab; optional **`file:`** URL via `URL` + pathname; `\` → `/`; strip leading `./`; reject `..`, ASCII controls, spaces, `?`, `#`, and `//` in the candidate; take the **last** path anchored at allowed roots **`src/`**, **`schemas/`**, **`examples/`**, **`docs/`**, **`test/`**, **`debug-ui/`**, **`plans/`**; final segment must use an allowed extension (**`ts`**, **`tsx`**, **`js`**, **`mjs`**, **`json`**, **`md`**, **`sql`**, case-insensitive on input; canonical paths lowercase the extension only). **Dedupe** with a set; **sort** UTF-16 string order.

**Product meaning:** **Each** harvested path **must** appear on at least one parsed diff row (any path position on that row), with **`rowKind`** ∈ **`{add, modify, delete, rename, copy, type_change}`** — i.e. the same semantics as an explicit **`requireMatchingRow`** rule per path. **Not** a global scope gate: other changed paths may appear in the diff without being cited. Paths in **Analysis**, **Design**, or other non-obligation sections do **not** produce derived rules unless they also appear in an obligation section or in **`todos[].content`** (subject to the gates above).

### Front matter YAML (always)

- Malformed front matter YAML → **`PLAN_VALIDATION_YAML_INVALID`**.
- If **`planValidation`** is present and core validation fails → **`PLAN_VALIDATION_SCHEMA_INVALID`** with prefix **`front matter planValidation:`**.

### Failure modes (plan-transition validation inputs)

| Condition | Code |
|-----------|------|
| Front matter YAML parse error | `PLAN_VALIDATION_YAML_INVALID` |
| `planValidation` present, core AJV fails | `PLAN_VALIDATION_SCHEMA_INVALID` (`front matter planValidation:` prefix) |
| No `planValidation`; body heading count > 1 | `PLAN_VALIDATION_AMBIGUOUS_BODY_RULES` |
| No `planValidation`; body heading count 1; section has no fences | `PLAN_VALIDATION_INSUFFICIENT_SPEC` |
| No `planValidation`; body heading count 1; first fence not `yaml`/`yml` | `PLAN_VALIDATION_INSUFFICIENT_SPEC` |
| No `planValidation`; body heading count 1; two or more `yaml`/`yml` fences in section | `PLAN_VALIDATION_AMBIGUOUS_BODY_RULES` |
| No `planValidation`; body heading count 1; body YAML parse error | `PLAN_VALIDATION_YAML_INVALID` (`body Repository transition validation:` prefix) |
| No `planValidation`; body heading count 1; body core AJV fails | `PLAN_VALIDATION_SCHEMA_INVALID` (`body Repository transition validation:` prefix) |
| No `planValidation`; body heading count 0; zero qualifying harvested paths | `PLAN_VALIDATION_INSUFFICIENT_SPEC` |
| Unsafe / invalid glob in rules (including derived synthetic rule patterns) | `PLAN_VALIDATION_INVALID_PATTERN` |
| Git / ref / parse errors | `PLAN_TRANSITION_*` |

### Requirements (environment and file)

- **Git:** minimum **2.30.0** (enforced before diff; operational code **`PLAN_TRANSITION_GIT_TOO_OLD`**).
- **Diff:** `git -C <repo> diff --no-ext-diff -z --name-status <before>..<after>` with **both** refs resolved via `git rev-parse --verify <ref>^{commit}`.
- **Plan file:** must start with YAML front matter (`---` … `---`); **`--plan`** must resolve under **`realpath(--repo)`** (operational **`PLAN_PATH_OUTSIDE_REPO`** if not). A leading UTF-8 BOM is stripped before parsing.
- **Rule shape SSOT:** [`schemas/plan-validation-core.schema.json`](../schemas/plan-validation-core.schema.json) — only the **`{ schemaVersion, rules }`** object is schema-validated when loaded from front matter or from the body fence. **Derived** rules are built in code as **N** **`requireMatchingRow`** rules (**`derived.require.*`**) with the shape above (each is schema-compatible with the **`requireMatchingRow`** branch of that schema).

### Rule kinds (`planValidation.rules[]`)

Each rule has **`id`** (`^[a-zA-Z0-9._-]+$`) and optional **`description`** (feeds step `intendedEffect.narrative`). Glob fields use **`picomatch`** with **`{ dot: true, nocase: false }`** (including `**`). Pattern preflight rejects `..`, leading `/`, Windows drive prefixes, and NUL (operational **`PLAN_VALIDATION_INVALID_PATTERN`**).

| `kind` | Fields | Semantics |
|--------|--------|-----------|
| `matchingRowsMustHaveRowKinds` | `pattern`, `rowKinds` | Every diff row touching `pattern` must have `rowKind` ∈ `rowKinds`. |
| `forbidMatchingRows` | `pattern` | No row may touch `pattern`. |
| `requireMatchingRow` | `pattern`, `rowKinds` | At least one row touches `pattern` and has `rowKind` ∈ `rowKinds`. |
| `allChangedPathsMustMatchAllowlist` | `allowPatterns` | Every path on every row (including **both** sides of rename/copy) must match ≥1 allowlist pattern. |
| `requireRenameFromTo` | `fromPattern`, `toPattern`, **`includeCopy`** (boolean, **required**) | Satisfied if ∃ row: `rowKind` ∈ `{rename}` when `includeCopy === false`, else ∈ `{rename, copy}`, with old/new paths matching patterns. |

Parsed diff rows map git status to `rowKind`: `A`→add, `M`→modify, `D`→delete, `R*`→rename, `C*`→copy, `T`→type_change, `U`→unmerged. Parser tests use NUL-delimited golden buffers per status class (`src/planTransition.test.ts`).

### Emitted `WorkflowResult`

- Default **`workflowId`:** **`wf_plan_transition`** (override with **`--workflow-id`**).
- One **`StepOutcome` per rule**; **`toolId`:** `plan_transition.rule.<id>`; **`verificationRequest`:** `null`; **`evidenceSummary.planTransition`:** `true` plus rule evidence (capped).
- **`aggregateWorkflow`** + **`finalizeEmittedWorkflowResult`** — same stdout **`WorkflowResult` v13** and stderr human truth report as batch verify. Trust lines and step **`result=`** phrases use git/plan wording when **`workflowId === wf_plan_transition`** (`workflowTruthReport.ts`).

### Synthetic `events.ndjson` (bundle)

With **`--write-run-bundle`**, **`events.ndjson`** is a **single** schema-valid **v1** `tool_observed` line, **`toolId`:** `plan_transition.meta`, **`params`:** `beforeRef`, `afterRef`, `beforeCommitSha`, `afterCommitSha`, `planResolvedPath`, `planSha256`, **`transitionRulesSource`** (`"front_matter"` \| `"body_section"` \| `"derived_citations"`). **`agent-run.json`** is **v1** unless **`--sign-ed25519-private-key`** is also set (then **v2** with **`workflow-result.sig.json`**), same as batch **`verify-workflow`**.

### Debug Console trust panel

When **`workflowId === wf_plan_transition`**, **`renderRunTrustPanelHtml`** uses a **plan/git** verification-basis line (not SQL-only copy); **`formatSqlEvidenceDetailForTrustPanel`** serializes **`evidenceSummary`** for plan steps.

### CLI

```text
verify-workflow plan-transition --repo <dir> --before <ref> --after <ref> --plan <path>
  [--workflow-id <id>] [--no-truth-report] [--write-run-bundle <dir>]
```

Exit codes match batch verify (**0** / **1** / **2** / **3**). Operational codes include **`PLAN_TRANSITION_*`** and **`PLAN_VALIDATION_*`** (see **`cliOperationalCodes.ts`** / **`operationalDisposition.ts`**).

### Proof in repo

- `src/planTransition.ts`, `src/planTransitionPathHarvest.ts`, `src/planTransitionConstants.ts`, `src/planTransition.test.ts`, `src/planTransitionPathHarvest.test.ts` (golden NUL fixtures, path harvest goldens, rule eval, git subprocess checks, CLI smoke).

## Audiences

### Engineer

**Mandatory taxonomy proofs (CI):** `failureOriginSchemaEnum.test.ts`, `taxonomyAuthority.test.ts`, `operationalDispositionDerivation.test.ts`, and `wireReasonEmittersGuard.test.ts` must pass on every change. After the taxonomy dedup work, `failureOriginCatalog.test.ts` **only** asserts run-level and event-sequence origin maps (it no longer exhaustively pins resolver or operational code tables).

| Module | Role |
|--------|------|
| `schemaLoad.ts` | AJV 2020-12 validators for event line, execution trace view, registry, workflow engine/result, **stdout v13** + **frozen v9** workflow result, truth report, compare-input (engine v7 / v9 / v13 **`oneOf`**), **`cli-error-envelope`**, **`run-comparison-report`**, **`agent-run-record-v1`**, **`agent-run-record-v2`**, **`workflow-result-signature`**, **`plan-validation-core`** |
| `failureCatalog.ts` | Stable run-level literals, `formatOperationalMessage`, CLI error envelope helpers |
| `cliOperationalCodes.ts` | Compare/corpus operational codes such as `COMPARE_INPUT_RUN_LEVEL_INCONSISTENT`, `WORKFLOW_RESULT_RUN_LEVEL_CODES_MISMATCH` |
| `runLevelDriftMessages.ts` | Fixed `message` strings for v9 `runLevelCodes` / `runLevelReasons` drift (SSOT for CLI stderr and corpus errors) |
| `wireReasonCodes.ts` | `as const` objects for every emitted step/registry resolver `code` string (`REGISTRY_RESOLVER_CODE`, `SQL_VERIFICATION_OUTCOME_CODE`, `REGISTRY_VALIDATION_CODE`, `UNKNOWN_TOOL`) |
| `operationalDisposition.ts` | `OPERATIONAL_DISPOSITION` — sole source of operational diagnosis values; catalog and actionable maps derive only from this object |
| `failureOriginTypes.ts` | Re-exports `FailureOrigin` / `FAILURE_ORIGINS` from `failureOriginTypes.generated.ts` (generated by `scripts/sync-failure-origin-from-schema.mjs` from the truth schema) |
| `truthLayerError.ts` | `TruthLayerError` for coded I/O and registry failures |
| `loadEvents.ts` | Read NDJSON, validate union event schema, filter `workflowId`; populate `runEvents` (capture order) and tool-only `events` via `prepareWorkflowEvents` + `eventSequenceIntegrity` |
| `prepareWorkflowEvents.ts` | Sole ingest `stableSortEventsBySeq`; attaches `eventSequenceIntegrity` |
| `eventSequenceIntegrity.ts` | Pure analysis of capture order vs `seq` and optional `timestamp` monotonicity (seq-sorted order) |
| `canonicalParams.ts` | `canonicalJsonForParams` — deterministic params serialization (retry divergence + `observedExecution.paramsCanonical`) |
| `planLogicalSteps.ts` | Stable sort, group by `seq`, canonical params equality, divergence vs last observation |
| `planTransition.ts` | **`plan-transition`**: git version gate, `-z` name-status parse, load rules from front matter **`planValidation`**, body **`Repository transition validation`** YAML fence, or **`derived_citations`** path harvest, rule eval → **`StepOutcome[]`**, **`buildPlanTransitionWorkflowResult`** (returns **`workflowResult`** + provenance), synthetic **`events.ndjson`** meta line |
| `planTransitionPathHarvest.ts` | Deterministic path citation harvest for **`derived_citations`**: obligation **H2** sections (Implementation / Testing / Documentation / Validation), per-line reference-only filter, **`todos[].content`** (full string, no filter), links + inline backticks, fenced-block stripping |
| `planTransitionConstants.ts` | **`PLAN_TRANSITION_WORKFLOW_ID`** (`wf_plan_transition`) — imported by truth report / debug panels without a cycle through `planTransition.ts` |
| `resolveExpectation.ts` | Registry + params → `VerificationRequest` / `sql_effects` / `sql_relational` resolution; `renderIntendedEffect` for step `intendedEffect.narrative` |
| `valueVerification.ts` | Canonical display strings + `verificationScalarsEqual` (single scalar comparison table) |
| `sqlConnector.ts` | SQLite parameterized read; lowercase column keys |
| `sqlReadBackend.ts` | `buildSelectByKeySql`, Postgres `SqlReadBackend`, `connectPostgresVerificationClient`, `applyPostgresVerificationSessionGuards` |
| `reconciler.ts` | `reconcileFromRows` (pure rule table), `reconcileSqlRow` (SQLite sync), `reconcileSqlRowAsync` (Postgres) |
| `multiEffectRollup.ts` | `rollupMultiEffectsSync` / `rollupMultiEffectsAsync`; `rollupSqlRelationalSync` / `rollupSqlRelationalAsync`; shared `computeMultiCheckRollupStatus` for multi-check `sql_effects` and `sql_relational` |
| `aggregate.ts` | Workflow status precedence |
| `actionableFailure.ts` | Actionable failure **`category`** / **`severity`** (workflow + operational), compare **`categoryHistogram`** / **`actionableCategoryRecurrence`**, P-CAT-1–4 and workflow S-1–S4; **`productionStepReasonCodeToActionableCategory`** + operational severity table |
| `verificationDiagnostics.ts` | Pinned step `failureDiagnostic`; `formatVerificationTargetSummary`; run/event-sequence `category:` helpers for human report (internal; not re-exported from package entry) |
| `agentRunBundle.ts` | `writeAgentRunBundle` — canonical run directory (three files, or four when signing) with per-file temp+rename; CLI `--write-run-bundle` / `--sign-ed25519-private-key`; optional `withWorkflowVerification` `persistBundle` |
| `workflowTruthReport.ts` | `buildWorkflowTruthReport`, `buildWorkflowVerdictSurface`, `finalizeEmittedWorkflowResult`, `formatWorkflowTruthReportStruct`, `formatWorkflowTruthReport`, `HUMAN_REPORT_RESULT_PHRASE`, `HUMAN_REPORT_PLAN_TRANSITION_PHRASE`, `STEP_STATUS_TRUTH_LABELS`, `TRUST_LINE_EVENT_SEQUENCE_IRREGULAR_SUFFIX`; human report text is rendering of structured truth with plain `result=` / `detail:` lines; plan-transition trust/result phrasing when **`workflowId === wf_plan_transition`** |
| `executionPathFindings.ts` | `buildExecutionPathFindings`, `buildExecutionPathSummary`, `ACTION_INPUT_REASON_CODES`, `RECONCILER_STEP_REASON_CODES` — execution-path layer orthogonal to SQL reconciliation (internal; not re-exported from package entry) |
| `workflowResultNormalize.ts` | `normalizeToEmittedWorkflowResult`, `workflowEngineResultFromEmitted` (compare ingress: engine **v7** / frozen **v9** / stdout **v13**; strip legacy **`runLevelCodes`**; inject empty **`verificationRunContext`** where needed) |
| `runComparison.ts` | `buildRunComparisonReport`, `formatRunComparisonReport`, `logicalStepKeyFromStep`, `recurrenceSignature`; cross-run comparison |
| `verificationPolicy.ts` | `VerificationPolicy` normalization/validation; `executeVerificationWithPolicySync` / `executeVerificationWithPolicyAsync` (strong vs eventual polling; `sql_row` / `sql_effects` / `sql_relational`); `createSqlitePolicyContext` |
| `executionTrace.ts` | `assertValidRunEventParentGraph`, `buildExecutionTraceView`, `formatExecutionTraceText`; `traceStepKind` derivation and `backwardPaths` |
| `pipeline.ts` | Orchestration: `runLogicalStepsVerification` (internal), async `verifyWorkflow`, sync `verifyToolObservedStep`, `withWorkflowVerification` (SQLite `dbPath` only); default `truthReport` / `logStep` |
| `cli.ts` | CLI entry: verify (**optional **`--write-run-bundle <dir>`** / **`--sign-ed25519-private-key`**), **`verify-bundle-signature`**, `compare`, `execution-trace`, `validate-registry`, **`debug`**, **`plan-transition`** |
| `debugCorpus.ts` | Debug Console corpus layout: enumerate `<corpusRoot>/<runId>/`, load outcomes (**`ok`** / **`error`**), path safety, mandatory **`agent-run.json`** manifest with SHA-256 bindings |
| `debugFocus.ts` | Pure **`buildFocusTargets`**: maps **`workflowTruthReport.failureAnalysis.evidence`** to trace navigation targets (tested golden vectors) |
| `debugPatterns.ts` | **`buildCorpusPatterns`**: histograms + **`recurrenceSignature`** aggregation; optional pairwise recurrence when **`workflowId`** filter set (cap **50** runs) |
| `debugRunFilters.ts` | Server-side **`GET /api/runs`** query parsing, pagination cursor, **`includeLoadErrors`** default **true**, **`hasPathFindings`** filter |
| `debugRunIndex.ts` | **`RunListItem`** facets for filters (**`pathFindingCodes`** from truth report); customer sentinel **`__unspecified__`** when **`agent-run.json`** omits **`customerId`** (ok rows) or on load errors |
| `debugServer.ts` | Local HTTP on **127.0.0.1** only: JSON APIs + static **`debug-ui/`** (copied to **`dist/debug-ui/`** on build) |
| `debugPanels.ts` | **`renderComparePanelHtml`**, **`renderRunTrustPanelHtml`**, **`formatSqlEvidenceDetailForTrustPanel`** — server-only HTML for compare/trust Debug panels; plan-transition basis line + evidence serialization when **`workflowId === wf_plan_transition`** |
| `agentRunRecord.ts` | **`buildAgentRunRecordForBundle`**, **`sha256Hex`**; types aligned with [`schemas/agent-run-record-v1.schema.json`](../schemas/agent-run-record-v1.schema.json) / [`schemas/agent-run-record-v2.schema.json`](../schemas/agent-run-record-v2.schema.json) |

### Integrator (stdout JSON)

For **multi-effect** tools (`verification.kind === "sql_effects"` in the registry), read **`WorkflowResult.steps[].verificationRequest.effects`**, **`evidenceSummary.effectCount`**, and **`evidenceSummary.effects[]`** (`id`, `status`, `reasons`, `evidenceSummary` per effect). Structured truth mirrors effect breakdown under **`workflowTruthReport.steps[].effects`**. Cross-run automation should use these fields—not only the step-level rollup message.

For **multi-check relational** tools (`verification.kind === "sql_relational"` with two or more checks), the same **`evidenceSummary.effectCount`** / **`evidenceSummary.effects[]`** shape applies on the step; resolved checks are on **`verificationRequest.checks`**. Normative behavior (failure codes, numerics, rollup parity with **`sql_effects`**) is specified only in [`relational-verification.md`](relational-verification.md).

Relational check authoring and the mapping from product vocabulary to registry checkKind values are normative only in [relational-verification.md](relational-verification.md#invariant-cookbook-product-vocabulary).

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

1. To verify your checkout with bundled `examples/` artifacts, run `npm start` from the repository root (see [Examples](#examples)) — that runs **`npm run build`** then **`scripts/first-run.mjs`** (DB seed + sample workflows). **`npm run first-run`** alone does **not** compile TypeScript; use it only after a successful **`npm run build`**.
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

**stdout:** Single JSON object matching `schemas/workflow-result.schema.json` (`schemaVersion` **`13`**; required **`verificationRunContext`** digest; required **`workflowTruthReport`** subtree validated by [`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json) — **SSOT** for structured truth JSON, including required **`failureAnalysis`** (`null` when complete, object when not — see [Actionable failure classification](#actionable-failure-classification-normative)); required **`executionPathFindings`** and **`executionPathSummary`** (see [Execution path findings](#execution-path-findings-normative)); required **`verificationPolicy`** `{ consistencyMode, verificationWindowMs, pollIntervalMs }`; required **`eventSequenceIntegrity`**; required **`runLevelReasons`** (**`runLevelCodes` is not a property** on v13 — derive a parallel code list with `runLevelReasons.map((r) => r.code)` if needed); each step includes **`intendedEffect`** `{ narrative }`, **`observedExecution`** `{ paramsCanonical }` (from evaluated `tool_observed.params` via `canonicalJsonForParams`), **`repeatObservationCount`**, and **`evaluatedObservationOrdinal`**; each non-**`verified`** step includes required **`failureDiagnostic`** — see [Verification diagnostics](#verification-diagnostics-normative)). The aggregated engine shape before finalization is `schemas/workflow-engine-result.schema.json` (`schemaVersion` **7**, also without **`runLevelCodes`**); see [Structured workflow truth report](#structured-workflow-truth-report-normative) and [Failure analysis](#failure-analysis-normative).

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
| **stdout** | One line; valid **`WorkflowResult`**; **`schemaVersion`** **13**; required **`verificationRunContext`**; required **`workflowTruthReport`** with **`failureAnalysis`** **`null`**; **`workflowId`** **`wf_complete`**; **`status`** **`complete`**; first step **`status`** **`verified`**; **`runLevelReasons`** **`[]`** (no **`runLevelCodes`** key) |
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
| **stderr** | One line; JSON with **`schemaVersion`** **2**, **`kind`** **`execution_truth_layer_error`**, **`code`** **`CLI_USAGE`**, **`message`** non-empty string length ≤ **2048**, required **`failureDiagnosis`** (`summary`, **`primaryOrigin`**, **`confidence`**, **`evidence`**, **`actionableFailure`**) — see [`schemas/cli-error-envelope.schema.json`](../schemas/cli-error-envelope.schema.json) |

**Enforcement:** **`test/ci-workflow-truth-postgres-contract.test.mjs`** implements these three cases; **`npm run test:workflow-truth-contract`** runs that file alone. **`npm run test:ci`** runs the full CI suite (build, Vitest, SQLite `node:test` files, **`npm run test:postgres`** which runs **`scripts/pg-ci-init.mjs`** then all Postgres-backed `node:test` files including this contract, then **`scripts/first-run.mjs`**). GitHub Actions runs **`npm run test:ci`** after **`npm ci`**.

### CLI operational errors

When the CLI exits **3**, **stderr** is exactly **one** UTF-8 line: a JSON object with:

- `schemaVersion`: **2**
- `kind`: **`execution_truth_layer_error`**
- `code`: one of **`CLI_USAGE`**, **`REGISTRY_READ_FAILED`**, **`REGISTRY_JSON_SYNTAX`**, **`REGISTRY_SCHEMA_INVALID`**, **`REGISTRY_DUPLICATE_TOOL_ID`**, **`EVENTS_READ_FAILED`**, **`SQLITE_DATABASE_OPEN_FAILED`**, **`POSTGRES_CLIENT_SETUP_FAILED`**, **`WORKFLOW_RESULT_SCHEMA_INVALID`**, **`VERIFICATION_POLICY_INVALID`**, **`VALIDATE_REGISTRY_USAGE`**, **`INTERNAL_ERROR`**, plus compare-subcommand codes (**`COMPARE_USAGE`**, **`COMPARE_INPUT_READ_FAILED`**, **`COMPARE_INPUT_RUN_LEVEL_INCONSISTENT`**, **`COMPARE_WORKFLOW_TRUTH_MISMATCH`**, …) as documented under [Cross-run comparison](#cross-run-comparison-normative), plus **`execution-trace`** codes (**`EXECUTION_TRACE_USAGE`**, **`TRACE_DUPLICATE_RUN_EVENT_ID`**, **`TRACE_UNKNOWN_PARENT_RUN_EVENT_ID`**, **`TRACE_PARENT_FORWARD_REFERENCE`**, …)
- `message`: human-readable text after whitespace normalization and truncation (max **2048** JavaScript string length; see `formatOperationalMessage` in `failureCatalog.ts`)
- `failureDiagnosis`: structured operational diagnosis (**`summary`**, **`primaryOrigin`**, **`confidence`**, **`evidence`** with **`referenceCode`**, **`actionableFailure`**) from `operationalFailureDiagnosis.ts`, using origin mappings in **`failureOriginCatalog.ts`** and category/severity in **`actionableFailure.ts`** (see [Actionable failure classification](#actionable-failure-classification-normative))

**stdout** must be empty on exit **3**. Automation should key on **`code`**, not exact **`message`**, for driver-dependent errors.

**`COMPARE_INPUT_RUN_LEVEL_INCONSISTENT`:** Emitted when **`verify-workflow compare`** loads a saved workflow result that validates as **frozen v9** (`schemas/workflow-result-v9.schema.json`) but fails the v9 consistency rule: `runLevelCodes.length === runLevelReasons.length` and `runLevelCodes[i] === runLevelReasons[i].code` for every index **`i`**. **`message`** is exactly: **`Compare input workflow result: runLevelCodes and runLevelReasons are inconsistent.`**

### Human truth report

**Stdout contract (normative):** Emitted **`WorkflowResult`** uses **`schemaVersion` `13`**. The **`runLevelCodes`** field is **absent** on v13 objects (AJV **`additionalProperties: false`** rejects it). Operators and tools that need a flat list of run-level codes should use **`runLevelReasons[].code`** (or derive `runLevelReasons.map((r) => r.code)`). **`runLevelReasons`** remains required.

**SSOT precedence (normative):** (1) JSON field names, requiredness, types, and enums on stdout are authoritative in **`schemas/*.schema.json`**; if this document’s prose disagrees, fix the prose. (2) Human stderr layout — exact line prefixes, order, and fixed phrases such as **`result=`** mapping — is authoritative in **this section** (Human truth report grammar); **`workflowTruthReport.ts`** must match verbatim; golden tests enforce agreement. (3) Where both schema and prose describe the same JSON semantics, **the schema wins**; prose summarizes and links without redefining shapes.

This section is **normative**: literals and line shape match `formatWorkflowTruthReportStruct` applied to `buildWorkflowTruthReport(engine)` in `workflowTruthReport.ts` and the contract tests.

**Why this shape**

- **Structured SSOT, one human rendering:** The canonical machine shape is **`workflowTruthReport`** on emitted **`WorkflowResult`** (see [Structured workflow truth report](#structured-workflow-truth-report-normative)). CLI, `verifyWorkflow`, and `withWorkflowVerification` write the human report via optional **`truthReport?: (report: string) => void`**; the default appends one newline after the string to **stderr** (`process.stderr.write`). Same text surfaces—no parallel logic.
- **stderr human / stdout JSON:** Automation keeps a single JSON record on stdout (`jq`, pipes); operators read the verdict on stderr. The CLI flag **`--no-truth-report`** yields empty stderr on verdict exits **0–2** so logs and parsers need not skip the human report (see [Batch and CLI (replay)](#batch-and-cli-replay)).
- **Default `truthReport` to stderr:** Gives a clear truth signal without extra configuration; silent tests pass `truthReport: () => {}`.
- **Default `logStep` no-op:** Removes the old default of one JSON object per step on stderr, which duplicated `WorkflowResult` and conflicted with the human report.
- **Fixed `trust:` lines:** Most `trust:` lines map to one `WorkflowStatus` from `aggregate.ts`, except the **eventual-window uncertainty** line which applies when `workflow_status` is `incomplete` under the narrow rule in the grammar below.
- **Machine-stable JSON labels (`STEP_STATUS_TRUTH_LABELS`):** The structured **`workflowTruthReport`** on stdout JSON uses fixed **`outcomeLabel`** strings (`VERIFIED`, `FAILED_ROW_MISSING`, …) for integrators and **`verify-workflow compare`**. The **human report text** uses plain-language **`result=`** phrases from **`HUMAN_REPORT_RESULT_PHRASE`** in `workflowTruthReport.ts` (same mapping table as JSON labels—see [Human text vs JSON `outcomeLabel`](#human-text-vs-json-outcomelabel) below). **Automation should key on stdout JSON**, not on parsing stderr text.
- **Run-level and event-sequence issues:** Human text leads with **`detail:`** (trimmed `message`), then **`category:`**, then **`reference_code:`** (wire `code`). Same sources as **`runLevelReasons`** / **`eventSequenceIntegrity.reasons`**.
- **Failure diagnosis:** When the workflow is not **`complete`**, after **`trust:`** and the execution-path block (see below), the human report includes a **`diagnosis:`** block mirroring **`workflowTruthReport.failureAnalysis`** on stdout JSON (see [Failure analysis](#failure-analysis-normative)), including one line **`actionable_failure: category=… severity=… recommended_action=… automation_safe=…`** (see [Actionable failure classification](#actionable-failure-classification-normative)).
- **Execution path:** Immediately after **`trust:`**, the human report includes **`execution_path:`** (summary string) and zero or more **`path_finding:`** lines with **`detail:`**, mirroring **`workflowTruthReport.executionPathFindings`** (see [Execution path findings](#execution-path-findings-normative)).
- **No trailing newline inside the returned string:** The default `truthReport` implementation appends `\n` when writing to stderr.

### Execution path findings (normative)

**Purpose:** Deterministic visibility into **captured execution behavior** (context retrieval, model/control graph, skipped tools, parameter/registry resolution failures, workflow completeness signals, ingest integrity) **orthogonal** to SQL end-state verification. Operators read **two axes**: (1) database trust from **`workflowStatus`**, steps, and **`failureAnalysis`**; (2) execution-path concerns from **`executionPathFindings`** / **`executionPathSummary`**.

**Hard rule:** Path findings **never** use reconciler-only step reason codes (`ROW_ABSENT`, `VALUE_MISMATCH`, `MULTI_EFFECT_*`, `ROW_NOT_OBSERVED_WITHIN_WINDOW`, `DUPLICATE_ROWS`, …) as top-level **`finding.code`** values. Invalid tool arguments surface as **`ACTION_INPUT_RESOLUTION_FAILED`** with the resolver reason in **`evidence.codes`**.

**Sources:** `buildExecutionPathFindings(engine)` in **`executionPathFindings.ts`** (internal module). **`verificationRunContext`** adds **`firstToolObservedIngestIndex`**, **`hasRunCompletedControl`**, **`lastRunEvent`**, and optional **`hitCount`** on **`retrievalEvents`** entries — see [`schemas/workflow-engine-result.schema.json`](../schemas/workflow-engine-result.schema.json) `$defs/verificationRunContext`.

**Integrators:** v1-only **`tool_observed`** traces get a coarse **`executionPathSummary`** explaining that full upstream visibility requires **schemaVersion 2** events (**`retrieval`**, **`model_turn`**, **`control`**, **`tool_skipped`**). When using the v2 graph, emit **`control`** with **`controlKind: run_completed`** at run end. **`retrieval.hitCount`** (when present) enables **`RETRIEVAL_THIN_HITS`** detection.

**Debug Console:** **`GET /api/runs?hasPathFindings=true`** returns only load-**`ok`** runs with non-empty **`pathFindingCodes`**.

**Reconciler code list:** Maintain **`RECONCILER_STEP_REASON_CODES`** in **`executionPathFindings.ts`** in the same PR whenever new post-SQL step reason codes are introduced.

### Structured workflow truth report (normative)

- **SSOT for JSON shape:** [`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json) (`$id` in file). Integrators and tools should treat that schema as the authoritative contract for **`workflowTruthReport`**; this document describes purpose and integration only (no duplicate field tables here).
- **Embedding:** On stdout / public API, **`workflowTruthReport`** is required on **`WorkflowResult`** with outer **`schemaVersion` 13** ([`schemas/workflow-result.schema.json`](../schemas/workflow-result.schema.json)); inner **`workflowTruthReport.schemaVersion`** is **6**.
- **Construction:** `buildWorkflowTruthReport(engine)` derives the object from **`WorkflowEngineResult`** (`schemaVersion` 7, [`schemas/workflow-engine-result.schema.json`](../schemas/workflow-engine-result.schema.json)) produced by `aggregateWorkflow` plus **`verificationRunContext`** merged in `verifyWorkflow` / `withWorkflowVerification`. `finalizeEmittedWorkflowResult` attaches the truth report and sets **`WorkflowResult.schemaVersion` 13**.
- **Evolution:** Additive changes to the truth report require bumping **`workflowTruthReport.schemaVersion`** inside the truth schema; breaking engine/stdout shape bumps **`WorkflowResult.schemaVersion`**; document changes in this file’s compatibility section.

### Failure analysis (normative)

**Purpose:** Deterministic root-cause hints for failed runs (human + machine) without LLMs.

- **`verificationRunContext`:** Required on **`WorkflowEngineResult`** / **`WorkflowResult`**. Built from filtered **`runEvents`** in file order by **`buildVerificationRunContext`** (`verificationRunContext.ts`). Includes **`retrievalEvents`** (optional per-row **`hitCount`**), **`controlEvents`**, **`modelTurnEvents`**, **`toolSkippedEvents`**, **`toolObservedIngestIndexBySeq`** (last ingest index per **`tool_observed`** `seq`), **`firstToolObservedIngestIndex`**, **`hasRunCompletedControl`**, and **`lastRunEvent`**. v1-only event files still populate tool indices and closure fields where derivable from **`tool_observed`** lines.
- **`failureAnalysis`:** Required on **`workflowTruthReport`**: JSON **`null`** when **`workflowStatus`** is **`complete`**; otherwise a structured object from **`buildFailureAnalysis`** (`failureAnalysis.ts`) with **`summary`**, **`primaryOrigin`** (`decision_making` \| `inputs` \| `retrieval` \| `tool_use` \| `workflow_flow` \| `downstream_system_state`), **`confidence`**, **`unknownReasonCodes`** (sorted unique; SSOT maps in **`failureOriginCatalog.ts`**), **`evidence[]`**, optional **`alternativeHypotheses`** (fixed for **`ROW_ABSENT`** and **`VALUE_MISMATCH`**), and required **`actionableFailure`** including **`recommendedAction`** and **`automationSafe`** (`actionableFailure.ts`; see [Actionable failure classification](#actionable-failure-classification-normative)).
- **Precedence (normative):** **P0** run-level reasons → **P1** retrieval **`error`** before failing tool ingest → **P2** bad **`model_turn`** / **`interrupt`** / skipped **`branch`/`gate`** → **P3** **`tool_skipped`** → **P4** irregular **`eventSequenceIntegrity`** → **P5** step driver (status severity, then `seq`, then `toolId`), with **P5b** multi-effect rollup to the lexicographically smallest failing effect **`id`**.
- **SSOT for code → origin:** **`failureOriginCatalog.ts`** (operational + step + run-level + event-sequence maps). **`failureOriginTypes.ts`** re-exports **`FailureOrigin`** / **`FAILURE_ORIGINS`** from generated **`failureOriginTypes.generated.ts`**; JSON Schema enums must match (**`failureOriginSchemaEnum.test.ts`** reads the schema on disk). This document does **not** duplicate the full code table.

**Compare / normalize:** Saved **`WorkflowEngineResult`** with **`schemaVersion` 5** is upgraded with an empty **`verificationRunContext`**. Saved **`WorkflowResult`** with **`workflowTruthReport.schemaVersion` 1–2** is upgraded by recomputing truth (no deep equality check on the embedded truth subtree). For **`workflowTruthReport.schemaVersion` ≥ **3**, **`normalizeToEmittedWorkflowResult`** requires recomputed truth to match the file (**`COMPARE_WORKFLOW_TRUTH_MISMATCH`** on mismatch).

### Actionable failure classification (normative)

**Purpose:** Deterministic **triage** categories for product and engineering (frequency, severity, recurrence) alongside existing **`primaryOrigin`** and step **`failureDiagnostic`** (those stay orthogonal).

**Normative sources (only two):**

1. JSON Schema enums: **`actionableFailure.category`**, **`actionableFailure.severity`**, **`$defs/recommendedAction`** (**`actionableFailure.recommendedAction`**) and required **`actionableFailure.automationSafe`** on **`workflowTruthReport.failureAnalysis`** ([`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json)), the same fields on CLI **`failureDiagnosis.actionableFailure`** ([`schemas/cli-error-envelope.schema.json`](../schemas/cli-error-envelope.schema.json)), and compare report fields **`perRunActionableFailures`**, **`categoryHistogram`**, **`actionableCategoryRecurrence`**, **`reliabilityAssessment`**, **`compareHighlights`** ([`schemas/run-comparison-report.schema.json`](../schemas/run-comparison-report.schema.json); report **`schemaVersion` `4`**).
2. Implementation **`actionableFailure.ts`**: P-CAT-1–4 precedence, workflow severity S-1–S4, **`OPERATIONAL_CODE_TO_SEVERITY`**, parallel remediation **`Record` maps** (workflow scopes) aligned with category classifiers, step-code partition consumed by **`productionStepReasonCodeToActionableCategory`** (exhaustiveness over **`PRODUCTION_STEP_REASON_CODES`** is tested in **`actionableFailure.partitionExhaustive.test.ts`** and **`actionableFailure.remediationExhaustive.test.ts`**).

**Non-normative:** Prose in this section beyond the two bullets above is explanatory; it must not introduce a third mapping authority.

### Recommended remediation (data-only contract)

<!-- etl:remediation-doctrine:evidence-order -->

Remediation tokens are chosen from the same **`failureAnalysis.evidence`** walk and primary-code selection rules as category and severity: **`deriveActionableCategory`** and **`deriveActionableFailureWorkflow`** in **`actionableFailure.ts`** share that ordering so a single failure analysis cannot **contradict** itself (for example, a “bad input” category with a downstream-only remediation hint). Operational CLI failures take **`recommendedAction`** and **`automationSafe`** from **`OPERATIONAL_DISPOSITION`** rows keyed by the operational code.

<!-- /etl:remediation-doctrine:evidence-order -->

<!-- etl:remediation-doctrine:compare-sentinel -->

**`RunComparisonReport.perRunActionableFailures`** is intentionally **rectangular**: every compared run carries the same fields, including when the workflow is trusted-complete. For runs with **`failureAnalysis === null`**, **`perRunActionableFromWorkflowResult`** emits category **`complete`**, severity **`low`**, **`recommendedAction` `none`**, and **`automationSafe: true`** so aggregates and histograms remain well-formed without special-casing missing keys.

<!-- /etl:remediation-doctrine:compare-sentinel -->

<!-- etl:remediation-doctrine:data-only -->

These fields are **verification** metadata for **external** consumers: they describe posture and intent, not commands. Mixing automated **mutation** (writes, orchestration) with read-only verification in the same process would break trust boundaries. The library never spawns **subprocesses** or runs SQL **based on** **`recommendedAction`** / **`automationSafe`**; treat them as hints for human or downstream policy only.

<!-- /etl:remediation-doctrine:data-only -->

**Enforcement (tests):** **`remediationWireSurfaceGuard.test.ts`** limits the **`recommendedAction`** identifier surface in production **`src/**/*.ts`**. **`remediationConsumptionGuard.test.ts`** restricts property access, forbids **`switch`** on these fields, and blocks executor entrypoints / risky imports in **`pipeline.ts`**, **`cli.ts`**, and **`reconciler.ts`**. **`actionableFailure.remediationExhaustive.test.ts`** covers workflow, CLI, and compare JSON boundaries plus the operational-success negative case (no stderr **`execution_truth_layer_error`** envelope). **`test/docs-remediation-doctrine.test.mjs`** (Module D) pins the marker blocks above.

**Workflow categories:** Eight literals: **`decision_error`**, **`bad_input`**, **`retrieval_failure`**, **`control_flow_problem`**, **`state_inconsistency`**, **`downstream_execution_failure`**, **`ambiguous`**, **`unclassified`**. Compare also emits synthetic **`complete`** (with severity **`low`**) per run when **`failureAnalysis`** is **`null`**, for histograms that sum to the run count.

**Cross-run comparison:** **`runIndex`** order in **`verify-workflow compare`** inputs is the normative time axis for **`actionableCategoryRecurrence`** (longest consecutive **`runIndex`** block per category). Integrators may map indices to wall-clock externally.

### Taxonomy authority (normative)

| Authority | Role |
|-----------|------|
| Wire enum **`$defs`** in [`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json) | Authoritative string unions and shapes for **`failureOrigin`**, **`failureConfidence`**, **`actionableFailure`**, categories, severities |
| **`$ref` targets** in [`schemas/cli-error-envelope.schema.json`](../schemas/cli-error-envelope.schema.json) and [`schemas/run-comparison-report.schema.json`](../schemas/run-comparison-report.schema.json) | CLI failure diagnosis and compare reports reuse truth-report defs (no duplicated inline enums where **`$ref`** applies) |
| **`scripts/sync-failure-origin-from-schema.mjs` → `failureOriginTypes.generated.ts`** | **`FailureOrigin`** literals are generated from **`$defs.failureOrigin.enum`**; **`npm run build`** runs the sync script before **`tsc`** |
| **`wireReasonCodes.ts`** (`REGISTRY_RESOLVER_CODE`, `SQL_VERIFICATION_OUTCOME_CODE`, `REGISTRY_VALIDATION_CODE`, `UNKNOWN_TOOL`) | Sole definitions for emitted step/registry resolver **`code`** strings consumed by emitters (`reconciler.ts`, `multiEffectRollup.ts`, `verificationPolicy.ts`, `resolveExpectation.ts`, `pipeline.ts`, `registryValidation.ts`) |
| **`OPERATIONAL_DISPOSITION`** in **`operationalDisposition.ts`** | Sole source of operational **`origin`**, **`summary`**, **`actionableCategory`**, **`actionableSeverity`**, **`recommendedAction`**, and **`automationSafe`**; **`failureOriginCatalog.ts`** and **`actionableFailure.ts`** build their operational maps **only** by deriving from this object |

**Mandatory tests:** **`failureOriginSchemaEnum.test.ts`**, **`taxonomyAuthority.test.ts`**, **`operationalDispositionDerivation.test.ts`**, **`wireReasonEmittersGuard.test.ts`**, **`actionableFailure.remediationExhaustive.test.ts`**, **`remediationWireSurfaceGuard.test.ts`**, **`remediationConsumptionGuard.test.ts`**, **`test/docs-remediation-doctrine.test.mjs`**. **`failureOriginCatalog.test.ts`** retains **only** run-level and event-sequence origin map coverage (see [Engineer](#engineer)).

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

**Human report (`category:` / step block):** Step lines are defined in the grammar below (**observed_execution**, **intended**, **verify_target**, then **`category:`** when **`status !== "verified"`**). After each run-level **`detail:`** block and each irregular `event_sequence` **`detail:`** block, one line `    category: ` + the same string as above (`workflow_execution` for all current SSOT run-level and event-sequence codes).

**Migration from v10 stdout:** Bump consumers to **`WorkflowResult.schemaVersion` 11** and **`workflowTruthReport.schemaVersion` 5**. Replace per-step string **`intendedEffect`** with **`intendedEffect: { narrative }`** and add **`observedExecution: { paramsCanonical }`** (same serialization as retry divergence). Repo maintenance: after **`npm run build`**, run **`node scripts/migrate-workflow-result-v11.mjs`** on saved JSON under **`test/golden/`** (sealed **`examples/debug-corpus/**`** bundles are excluded — update their **`agent-run.json`** digests if you change **`workflow-result.json`** by hand). **`Migration from schema v4/v5/v6/v7/v9`** (engine / frozen v9) is unchanged: read **`verificationRunContext`**, **`failureAnalysis`**, etc.; drop top-level **`runLevelCodes`** on stdout JSON.

**Migration from v11 stdout:** Bump saved **`WorkflowResult.schemaVersion`** to **12** (no step-shape changes). Run **`npm run migrate:workflow-result-v12`** on JSON trees under **`test/golden/`**, **`test/fixtures/`**, and **`examples/`** (excluding sealed debug-corpus bundles as in the v11 script).

**Migration from v12 stdout:** Bump saved **`WorkflowResult.schemaVersion`** to **13** and recompute embedded **`workflowTruthReport`** (adds **`recommendedAction`** / **`automationSafe`** on **`actionableFailure`** and truth **`schemaVersion` 6**). After **`npm run build`**, run **`npm run migrate:workflow-result-v13`** on the same JSON trees (same exclusions as the v12 script). Do not hand-edit saved **`WorkflowResult`** files for this bump.

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
   - Otherwise: line `run_level:` then for each entry in **`runLevelReasons`** order: line `  - detail: ` + `reason.message` (trimmed), or `(no message)` if empty after trim; then line `    category: ` + category from `failureDiagnosticForRunLevelCode(reason.code)`; then line `    reference_code: ` + `reason.code`.
   - Run-level codes in JSON are **only** on **`runLevelReasons[].code`** (v13 stdout has **no** separate **`runLevelCodes`** array). When there are no matching events for the workflow id, the library appends **`NO_STEPS_FOR_WORKFLOW`** with message `No tool_observed events for this workflow id after filtering.`
   - Catalog literal for **`MALFORMED_EVENT_LINE`**: `Event line was missing, invalid JSON, or failed schema validation for a tool observation.`

3. **Event sequence integrity**
   - Immediately after the **run-level** block: if **`eventSequenceIntegrity.kind`** is **`normal`**, line exactly `event_sequence: normal`.
   - If **`kind`** is **`irregular`**: line `event_sequence: irregular`, then for each entry in **`eventSequenceIntegrity.reasons`** in array order: line `  - detail: ` + `reason.message` (trimmed), or `(no message)` if empty after trim; then line `    category: ` + `workflow_execution`; then line `    reference_code: ` + `reason.code`.
   - **Codes and messages** for these reasons are defined in **`EVENT_SEQUENCE_MESSAGES`** and **`eventSequenceTimestampNotMonotonicReason`** in `failureCatalog.ts` (SSOT for wire `message` strings).

4. **Steps**
   - Line exactly `steps:`.
   - For each step in array order: one line `  - seq=` + decimal seq + ` tool=` + toolId + ` result=` + plain phrase, where the phrase is **`HUMAN_REPORT_RESULT_PHRASE[outcomeLabel]`** in `workflowTruthReport.ts` and **`outcomeLabel`** is from **`STEP_STATUS_TRUTH_LABELS`** for that step status (defensive: `\r`/`\n` in toolId → `_`). Status → JSON **`outcomeLabel`** (and thus human **`result=`**) mapping:

| Step status | JSON `outcomeLabel` | Human `result=` phrase (exact strings in `HUMAN_REPORT_RESULT_PHRASE`) |
|-------------|---------------------|------------------------------------------------------------------------|
| `verified` | `VERIFIED` | `Matched the database.` |
| `missing` | `FAILED_ROW_MISSING` | `Expected row is missing from the database (the log implies a write that is not present).` |
| `inconsistent` | `FAILED_VALUE_MISMATCH` | `A row was found, but required values do not match.` |
| `incomplete_verification` | `INCOMPLETE_CANNOT_VERIFY` | `This step could not be fully verified (registry, connector, or data shape issue).` |
| `partially_verified` | `PARTIALLY_VERIFIED` | `Some intended database effects matched; others did not.` |
| `uncertain` | `UNCERTAIN_NOT_OBSERVED_WITHIN_WINDOW` | `The expected row did not appear within the verification window.` |

   - Immediately after that header line: exactly one line `    observations: evaluated=` + decimal `evaluatedObservationOrdinal` + ` of ` + decimal `repeatObservationCount` + ` in_capture_order` (four spaces before `observations:`; no trailing spaces; no period).
   - Next line: `    observed_execution: ` + single-line text from **`workflowTruthReport.steps[].observedExecution.paramsCanonical`** (each `\r`/`\n` replaced by ASCII space, runs of spaces collapsed, trimmed — same rules as **`intended:`**).
   - If **`intendedEffect.narrative`** is non-empty after trim: `    intended: ` + single-line text (each `\r`/`\n` replaced by ASCII space, runs of spaces collapsed, trimmed).
   - If **`formatVerificationTargetSummary`** returns non-null for the step’s **`verificationRequest`**, the next line is `    verify_target: ` + that summary (for **all** step statuses, including **`verified`**); otherwise no `verify_target:` line.
   - If **`status !== "verified"`**: next line `    category: ` + that step’s **`failureDiagnostic`** (must match JSON).
   - For each step-level reason: line `    detail: ` + trimmed message, or `(no message)` if empty after trim; if `field` is set and non-empty, append ` field=` + field value to the same line; then line `    reference_code: ` + code.
   - **Multi-effect steps:** when `evidenceSummary.effects` is present (see [Workflow result: multi-effect shape](#workflow-result-multi-effect-shape)), after the step-level reasons (if any), emit one line per effect in **UTF-16 lexicographic order of effect `id`** (same comparator as `canonicalJsonForParams` object keys): `    effect: id=` + id + ` result=` + phrase from **`HUMAN_REPORT_EFFECT_RESULT_PHRASE`** (same mapping as the table above for effect-level statuses; **`partially_verified`** does not appear at the effect level). For each effect reason: line `      detail: ` + message (same rules as step-level), then `      reference_code: ` + code (six spaces before `detail:` and `reference_code:`).

**Engineer note:** Any change to fixed sentences or phrases requires updating golden tests and `test/docs-contract.test.mjs` pins.

#### Human text vs JSON `outcomeLabel`

| Human report `result=` (prefix) | JSON `workflowTruthReport.steps[].outcomeLabel` | Typical `WorkflowResult.steps[].status` |
|---------------------------------|-------------------------------------------------|----------------------------------------|
| `Matched the database.` | `VERIFIED` | `verified` |
| `Expected row is missing from the database` … | `FAILED_ROW_MISSING` | `missing` |
| `A row was found, but required values do not match.` | `FAILED_VALUE_MISMATCH` | `inconsistent` |
| `This step could not be fully verified` … | `INCOMPLETE_CANNOT_VERIFY` | `incomplete_verification` |
| `Some intended database effects matched` … | `PARTIALLY_VERIFIED` | `partially_verified` |
| `The expected row did not appear within the verification window.` | `UNCERTAIN_NOT_OBSERVED_WITHIN_WINDOW` | `uncertain` |

Step- and effect-level **`detail:`** / **`reference_code:`** pairs align with **`reasons[].message`** and **`reasons[].code`** on the same object in stdout JSON. **Alerts and automation** should prefer **`stdout` JSON** or structured **`workflowTruthReport`**, not regex on stderr, because human wording may evolve while JSON labels stay versioned. Older integrations that matched human lines containing **`status=`** must migrate to JSON fields or to **`result=`** / **`reference_code:`** lines.

### Operator

- **Reading order (human truth report):** (1) **`trust:`** — overall verdict. (2) **`diagnosis:`** — `summary`, origins, **`actionable_failure`**. (3) **`steps:`** — for the failing line: **`seq=`** / **`tool=`** / **`result=`**, then **`verify_target:`**, **`intended:`**, **`observed_execution:`**. (4) Step-level **`detail:`** / **`reference_code:`** (rollup reason). (5) For **`sql_effects`**, each **`effect: id=`** block with its own **`detail:`** / **`reference_code:`** (per-effect reconciler outcome).
- **Reading logs:** Treat **stderr** as the human verdict for a verification run; **stdout** (CLI) is the machine-readable `WorkflowResult`. Correlate them by process / timestamp in your log stack.
- **`trust:` line:** Treat as **trusted** only when it is the `TRUSTED:` sentence **and** `workflow_status: complete`. Any line starting with `NOT TRUSTED:` means the workflow must not be treated as fully verified—investigate `steps:`, `run_level:`, and **`event_sequence:`**.
- **Exit codes:** 0 = `complete`, 1 = `inconsistent`, 2 = `incomplete`, 3 = operational failure ([CLI operational errors](#cli-operational-errors)); **`--help`** exits **0**.
- DB user should be **read-only** in production (Postgres: **SELECT-only** role; the product also sets **session read-only** via `applyPostgresVerificationSessionGuards`).
- **`npm test`** (default local validation) runs **`npm run build`**, **`npm run test:vitest`**, SQLite-only **`npm run test:node:sqlite`**, and **`scripts/first-run.mjs`** — **no** Postgres. **`npm install` does not run `tsc`** (there is no **`prepare`** script). **`npm run test:ci`** requires Postgres 16+ and env **`POSTGRES_ADMIN_URL`** (superuser, runs [`scripts/pg-ci-init.mjs`](../scripts/pg-ci-init.mjs) inside **`npm run test:postgres`**) and **`POSTGRES_VERIFICATION_URL`** (role `verifier_ro` / SELECT-only on seeded tables). CI sets both; locally use the README Docker one-liner and export the same URLs for **`npm run test:ci`**.
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

The file is a **`oneOf`** union:

- **`schemaVersion` `1`**, **`type` `tool_observed`**: legacy tool line (no `runEventId`). Same required fields as before: `workflowId`, `seq`, `toolId`, `params`.
- **`schemaVersion` `2`**: every branch requires `workflowId`, `runEventId` (non-empty string), and `type`. Optional `parentRunEventId` (non-empty string when present) must reference the **`runEventId` of a strictly earlier line** in the same workflow’s `runEvents` capture order (see [End-to-end execution visibility](#end-to-end-execution-visibility-normative)). **`v1` `tool_observed` lines do not have a wire `runEventId` and cannot be referenced as `parentRunEventId` targets**; use **`schemaVersion` `2` `tool_observed`** to link causality through a tool call.

**`type` values (v2):** `tool_observed` (also requires `seq`, `toolId`, `params`), `model_turn` (`status`: `completed` \| `error` \| `aborted` \| `incomplete`), `retrieval` (`source`, `status`: `ok` \| `empty` \| `error`), `control` (`controlKind`: `branch` \| `loop` \| `interrupt` \| `gate` \| `run_completed`; optional `label`; optional `decision`: `taken` \| `skipped` for branch/gate), `tool_skipped` (`toolId`, `reason`).

**SQL verification** consumes only **`type` `tool_observed`** lines (v1 or v2); other types are ignored for reconciliation but appear in **`runEvents`** and execution traces.

**Not allowed on the event:** `expectation` / `verification` objects — the resolver must derive verification from the registry.

**Optional summaries:** `model_turn.summary`, `retrieval.querySummary`, etc. may contain sensitive text; **redact** before retention outside the trust boundary (same policy as `params`).

### Retry and repeated seq

Multiple event lines with the same `workflowId` and **`seq`** are treated as **retries** of one logical step. **Capture order** is: after stable sort by `seq`, ties keep **file line order** (batch) or **`observeStep` call order** (session). The **last** observation in that order is the one reconciled against SQL when all observations in the group **match** the last on `toolId` and **canonical params** (see below). If any observation differs from the last, the step is **`incomplete_verification`** / **`RETRY_OBSERVATIONS_DIVERGE`** and **no** SQL reconcile runs for that step.

**`canonicalJsonForParams(value)`** (divergence + **`observedExecution.paramsCanonical`**; implemented in `canonicalParams.ts`):

- `null`, `boolean`, `number`, or `string`: `JSON.stringify(value)` per ECMAScript.
- Array: `[` + elements each passed through `canonicalJsonForParams`, joined by `,` + `]` (no spaces).
- Plain object (`typeof === "object"`, not array, not null): own enumerable string keys sorted by UTF-16 code unit order with comparator `(a, b) => (a < b ? -1 : a > b ? 1 : 0)`; `{` + for each key: `JSON.stringify(key)` + `:` + `canonicalJsonForParams(value[key])`, joined by `,` + `}` (no spaces).
- Any other value: sentinel `"__non_json_params:" + typeof value + "__"` (never equal to normal JSON-derived strings).

Two observations **match** iff `toolId` is `===` and `canonicalJsonForParams(params_a) === canonicalJsonForParams(params_b)`.

## End-to-end execution visibility (normative)

**Purpose:** Reconstruct the full capture-ordered execution path (model turns, retrieval, control, tool skipped, tool observed) and walk backward from the terminal event and from each verified step.

**Loader (`loadEventsForWorkflow`) — single ingest rule:** For each non-empty physical NDJSON line: if `JSON.parse` throws **or** the line fails the event union schema **or** (after parse) `workflowId` does not match the requested id → on parse/schema failure increment **`malformedEventLineCount`**, append **`MALFORMED_EVENT_LINE`** to **`runLevelReasons`**, and **do not** append to **`runEvents`** or the tool candidate list; on `workflowId` mismatch only, skip the line without counting malformed. Otherwise append to **`runEvents`** in encounter order, and if `type === "tool_observed"` also append to the tool candidate list. Then **`events`** = `prepareWorkflowEvents(toolCandidates).eventsSorted` (seq-sorted tools only); **`eventSequenceIntegrity`** is computed from those tool candidates only. **`runEvents`** is in **capture order** for the filtered workflow.

**`LoadEventsResult`:** **`events`** — tool observations only, sorted for verification (unchanged meaning for existing callers). **`runEvents`** — all valid union events for the workflow in capture order.

**Trace artifact:** [`schemas/execution-trace-view.schema.json`](../schemas/execution-trace-view.schema.json). TypeScript: `buildExecutionTraceView({ workflowId, runEvents, malformedEventLineCount, workflowResult? })` in **`executionTrace.ts`**. Output **`ExecutionTraceView`**: `schemaVersion` **1**, `workflowId`, `runCompletion` (`completed` iff the last node by capture order is `control` with `controlKind` **`run_completed`**; else `unknown_or_interrupted`), **`malformedEventLineCount`** (same integer as the loader), **`nodes[]`**, **`backwardPaths[]`**.

**`nodes[]`:** One node per `runEvents` entry. **`runEventId`**: wire `runEventId` for v2; for v1 `tool_observed`, synthetic **`syn:${ingestIndex}`** (display and path walking only — **never** valid on the wire as `parentRunEventId`). **`parentRunEventId`**: wire parent when valid; else `null`. **`traceStepKind`** is derived by first matching row in the table below (tool logical-step metadata from `planLogicalSteps` on the tool-only subsequence).

| Condition | `traceStepKind` |
|-----------|-----------------|
| `tool_skipped` | `skipped` |
| `control`, `branch` or `gate`, `decision` `taken` | `branch_taken` |
| `control`, `branch` or `gate`, `decision` `skipped` | `branch_skipped` |
| `model_turn`, `status` `error` | `failed` |
| `model_turn`, `status` `completed` | `success` |
| `model_turn`, `status` `aborted` or `incomplete` | `failed` |
| `retrieval`, `status` `error` | `failed` |
| `retrieval`, `status` `ok` | `success` |
| `retrieval`, `status` `empty` | `neutral` |
| `control`, `interrupt` | `failed` |
| `control`, `run_completed` | `success` |
| `control`, `loop` | `neutral` |
| `tool_observed`, logical step **divergent**, this line is **last** in capture order for that `seq` | `divergent_observations` |
| `tool_observed`, `repeatObservationCount > 1`, not last in capture order for that `seq` | `repeated_observation` |
| `tool_observed`, last for `seq`, `WorkflowResult` supplied, step **verified** | `success` |
| `tool_observed`, last for `seq`, `WorkflowResult` supplied, step not verified | `failed` |
| `tool_observed`, last for `seq`, no `WorkflowResult` | `neutral` |
| (else) | `neutral` |

**`verificationLink` on a node:** Set only on the **evaluated** `tool_observed` line for each `seq` (last in capture order among tools with that `seq`) when **`workflowResult`** was passed into `buildExecutionTraceView`; copies `stepIndex`, `seq`, `engineStepStatus` (`WorkflowResult.steps[i].status`), `truthOutcomeLabel` (`workflowTruthReport.steps[i].outcomeLabel`). Otherwise `null`.

**`backwardPaths`:** Always includes **`workflow_terminal`** when `nodes.length > 0`: `seedRunEventId` is the last node’s `runEventId`, `ancestorRunEventIds` is `[seed, parent(seed), …, root]` following **`parentRunEventId`** on nodes. When **`workflowResult`** is supplied, append one **`verification_step`** per `steps[i]` that has a matching `tool_observed` for `steps[i].seq` (seed = evaluated observation for that `seq`, same ancestor walk). Ordering: `workflow_terminal` first, then **`verification_step`** rows in ascending `stepIndex`.

**CLI:** `verify-workflow execution-trace --workflow-id <id> --events <path> [--workflow-result <path>] [--format json|text]`. Success: stdout = `ExecutionTraceView` JSON or `formatExecutionTraceText` output; stderr empty; exit **0**. Operational failure (usage, graph validation, read/parse errors): stderr = one-line `cliErrorEnvelope`; stdout empty; exit **3**.

**In-process:** `observeStep` accepts the same union; **`withWorkflowVerification`** buffers all valid events in capture order and feeds only `tool_observed` into verification (same as batch).

**Module binding:** `executionTrace.ts`, `loadEvents.ts`, `execution-trace-view.schema.json`, `event.schema.json`.

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

**Step rollup (multi-effect only):** all effects `verified` → step `verified`. Any effect `incomplete_verification` → step `incomplete_verification`. Else if every effect is `missing` or `inconsistent` → step `inconsistent` with one summary reason `MULTI_EFFECT_ALL_FAILED` whose `message` lists failed effect ids and, after **`Per effect:`**, each failed effect as **`id (firstReasonCode)`** separated by **`; `** (UTF-16 sorted by `id`), passed through `formatOperationalMessage`. Else if at least one `verified` and at least one `missing`/`inconsistent` → step `partially_verified` with one summary reason `MULTI_EFFECT_PARTIAL` using the same **`Per effect:`** pattern for non-verified effects only.

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

**Compatibility:** Emitted **`WorkflowResult.schemaVersion`** is **13** with required **`workflowTruthReport`** and **`verificationRunContext`** (no **`runLevelCodes`**). The engine-only JSON (`schemaVersion` **7**) is defined by [`schemas/workflow-engine-result.schema.json`](../schemas/workflow-engine-result.schema.json). Required **`verificationPolicy`** and **`eventSequenceIntegrity`**; non-**`verified`** steps require **`failureDiagnostic`**; consumers must allow step `status` **`uncertain`** (see [`schemas/workflow-result.schema.json`](../schemas/workflow-result.schema.json)).

## Agent run record (canonical bundle)

### Cryptographic signing of workflow-result (normative)

1. **Trust model.** The **signer** holds a **PKCS#8 PEM Ed25519 private key** on disk at write time. A **verifier** supplies a **SPKI PEM public key** file when running **`verify-bundle-signature`** or the library API **`verifyRunBundleSignature(runDir, ed25519PublicKeyPemPath)`**. **`loadCorpusRun`** performs **integrity-only** checks (length + SHA-256 vs manifest) for the signature file when the manifest is **v2**; it does **not** perform Ed25519 verification unless a future explicit option is added. The sidecar embeds the signing public key as **`signingPublicKeySpkiPem`**; verification requires that string (after LF normalization and outer trim) **equals** the trusted public key file contents **before** **`crypto.verify`** runs—so a mismatch is unambiguous.

2. **Key file formats (OpenSSL).** Private key (PKCS#8 PEM):

   ```bash
   openssl genpkey -algorithm ED25519 -out ed25519-private.pem
   ```

   Public key (SPKI PEM):

   ```bash
   openssl pkey -in ed25519-private.pem -pubout -out ed25519-public.pem
   ```

   **No** raw 32-byte key files and **no** alternate encodings in API, CLI, or tests.

3. **Signed message.** The Ed25519 signature covers the **exact on-disk UTF-8 bytes** of **`workflow-result.json`**—the same bytes whose SHA-256 is recorded under **`artifacts.workflowResult`** in the manifest.

4. **Sidecar `workflow-result.sig.json`.** UTF-8 JSON **object** with **exactly** these keys in **this order** (implementations should assign in this order so **`JSON.stringify`** is stable): **`algorithm`** (`"ed25519"`), **`schemaVersion`** (**`1`**, integer), **`signatureBase64`**, **`signedContentSha256Hex`** (64 lowercase hex chars; must equal SHA-256 of **`workflow-result.json`** bytes), **`signingPublicKeySpkiPem`** (SPKI PEM text, Unix line endings, trailing newline after the **`END`** line). After **`JSON.stringify`**, append **exactly one** newline (**`0x0A`**). No BOM. Structural SSOT: [`schemas/workflow-result-signature.schema.json`](../schemas/workflow-result-signature.schema.json).

5. **Verification sequence** for **`verifyRunBundleSignature`** / **`verify-bundle-signature`** (first failure wins with the code for that step):

   1. Read and parse **`agent-run.json`**.
   2. Dispatch AJV **v1** vs **v2** from **`schemaVersion`**; unsupported version → **`BUNDLE_SIGNATURE_MANIFEST_UNSUPPORTED_VERSION`**; v1 → **`BUNDLE_SIGNATURE_UNSIGNED_MANIFEST`**.
   3. Read **`events.ndjson`**, compare length + SHA-256 to manifest.
   4. Read **`workflow-result.json`**, compare length + SHA-256 to manifest.
   5. Read **`workflow-result.sig.json`**, compare length + SHA-256 to manifest.
   6. **`JSON.parse`** sidecar + AJV **`workflow-result-signature`**.
   7. Assert **`signedContentSha256Hex ===`** manifest **`artifacts.workflowResult.sha256`**.
   8. **Before** **`crypto.verify`**, normalize LF and compare **`signingPublicKeySpkiPem`** to **`--public-key`** file contents — mismatch → **`BUNDLE_SIGNATURE_PUBLIC_KEY_MISMATCH`**.
   9. **`crypto.verify`** on **`workflow-result.json`** bytes using the public key from the file — false → **`BUNDLE_SIGNATURE_CRYPTO_INVALID`**.

6. **Manifest v1 vs v2.** After **`JSON.parse`** of **`agent-run.json`**, if **`schemaVersion === 2`**, validate with [`schemas/agent-run-record-v2.schema.json`](../schemas/agent-run-record-v2.schema.json) (requires **`artifacts.workflowResultSignature`** for **`workflow-result.sig.json`**). If **`schemaVersion === 1`**, validate with [`schemas/agent-run-record-v1.schema.json`](../schemas/agent-run-record-v1.schema.json). Otherwise fail verification with **`BUNDLE_SIGNATURE_MANIFEST_UNSUPPORTED_VERSION`**.

7. **Write order and atomicity.** **`writeAgentRunBundle`** renames in order: **`events.ndjson`** → **`workflow-result.json`** → **`workflow-result.sig.json`** (signed path only) → **`agent-run.json`**. **Successful return** implies all final files exist and match the v2 manifest. If an error is thrown after some renames in the **signed** path, the implementation **best-effort `unlinkSync`** finals completed in **this** invocation in **reverse** order (sig → workflow-result → events), then rethrows. **Process crash** may leave an inconsistent directory; operators re-run the write. **Required test:** `src/agentRunBundle.rollback.test.ts` simulates failure when renaming into **`agent-run.json`** and asserts none of the four finals remain.

8. **Canonical machine codes** are the **`export const`** string values in [`src/bundleSignatureCodes.ts`](../src/bundleSignatureCodes.ts). Every verification/signing failure path uses one of these literals (also re-exported from the package entry):

   | Code string |
   |-------------|
   | `BUNDLE_SIGNATURE_UNSIGNED_MANIFEST` |
   | `BUNDLE_SIGNATURE_MANIFEST_UNSUPPORTED_VERSION` |
   | `BUNDLE_SIGNATURE_MANIFEST_INVALID` |
   | `BUNDLE_SIGNATURE_MISSING_ARTIFACT` |
   | `BUNDLE_SIGNATURE_ARTIFACT_INTEGRITY` |
   | `BUNDLE_SIGNATURE_SIDECAR_INVALID` |
   | `BUNDLE_SIGNATURE_SIGNED_HASH_MISMATCH` |
   | `BUNDLE_SIGNATURE_PUBLIC_KEY_MISMATCH` |
   | `BUNDLE_SIGNATURE_CRYPTO_INVALID` |
   | `BUNDLE_SIGNATURE_PRIVATE_KEY_INVALID` |

9. **CLI.** Subcommand **`verify-bundle-signature --run-dir <dir> --public-key <path>`** calls **`verifyRunBundleSignature`** only (no duplicate verify logic). Exit **0** iff **`{ ok: true }`**. All verification failures use exit **3** with a **single-line** stderr JSON object matching [`schemas/cli-error-envelope.schema.json`](../schemas/cli-error-envelope.schema.json) and **`code`** set to the exact **`BUNDLE_SIGNATURE_*`** string. **Do not** use exit **2** for signature failure (exit **2** remains **incomplete** workflow verdict on **`verify-workflow`**). **`verify-workflow`** accepts **`--sign-ed25519-private-key <path>`** only together with **`--write-run-bundle`**. **`persistBundle.ed25519PrivateKeyPemPath`** (library) threads the same option to **`writeAgentRunBundle`**. **Required tests:** `test/bundle-signature-cli-write.test.mjs` (CLI signed write + verify), `src/withWorkflowVerification.persistBundle.test.ts` (pipeline signed write + **`verifyRunBundleSignature`**).

10. **Fixture regeneration:** `node scripts/generate-signed-bundle-fixture.mjs` (writes **`test/fixtures/signed-bundle-v2/`**; no private keys committed).

### Why

The product treats each inspectable saved run as **three on-disk artifacts plus a manifest** (or **four artifacts** when cryptographically signed): **`events.ndjson`** (raw capture), **`workflow-result.json`** (emitted verification), optional **`workflow-result.sig.json`**, and **`agent-run.json`** (identity, optional **`customerId`** / **`capturedAt`**, **`producer`**, **`verifiedAt`**, and **SHA-256** + **byte length** for each listed artifact). **There is no `meta.json`** on this path—tenant metadata lives only on the manifest.

### Schema

Structural SSOT: [`schemas/agent-run-record-v1.schema.json`](../schemas/agent-run-record-v1.schema.json) (**`schemaVersion` `1`**, unsigned—**`workflow-result.json`** and **`events.ndjson`** only) and [`schemas/agent-run-record-v2.schema.json`](../schemas/agent-run-record-v2.schema.json) (**`schemaVersion` `2`**, adds required **`artifacts.workflowResultSignature`** for **`workflow-result.sig.json`**). Loaders pick the validator by parsed **`schemaVersion`**.

### `loadCorpusRun` verification order (normative)

1. **Path safety:** resolved run directory must stay under the corpus root; otherwise **`PATH_ESCAPE`**.
2. **Manifest presence:** missing **`agent-run.json`** → **`MISSING_AGENT_RUN_MANIFEST`**.
3. **`JSON.parse`** manifest: failure → **`AGENT_RUN_JSON_SYNTAX`**.
4. **AJV** validate manifest (**v1** or **v2** by **`schemaVersion`**): failure → **`AGENT_RUN_INVALID`**.
5. **Workflow result artifact:** resolve path; if missing → **`MISSING_WORKFLOW_RESULT`**; else read bytes; if length ≠ manifest **`byteLength`** → **`ARTIFACT_LENGTH_MISMATCH`**; if **`sha256`** ≠ manifest → **`ARTIFACT_INTEGRITY_MISMATCH`**.
6. **Events artifact:** same checks for **`events.ndjson`** → **`MISSING_EVENTS`** / **`ARTIFACT_LENGTH_MISMATCH`** / **`ARTIFACT_INTEGRITY_MISMATCH`**.
7. **Manifest v2 only — signature artifact:** if **`schemaVersion` `2`**, resolve **`workflow-result.sig.json`**; if missing → **`MISSING_WORKFLOW_RESULT_SIGNATURE`**; else length + SHA-256 vs manifest → **`ARTIFACT_LENGTH_MISMATCH`** / **`ARTIFACT_INTEGRITY_MISMATCH`**.
8. **Parse** workflow-result bytes: failure → **`WORKFLOW_RESULT_JSON`**.
9. **v9 run-level alignment (before AJV):** If the parsed object has **`schemaVersion` `9`**, require **`runLevelCodes`** and **`runLevelReasons`** arrays of equal length with **`runLevelCodes[i] === runLevelReasons[i].code`** for every index; on failure → **`WORKFLOW_RESULT_RUN_LEVEL_CODES_MISMATCH`** with **`message`** exactly **`Corpus workflow result: runLevelCodes and runLevelReasons are inconsistent.`** (see [Corpus load outcomes](#corpus-load-outcomes-normative)).
10. **Workflow-result schema + normalize:** v9 documents validate against **`workflow-result-v9.schema.json`**; v13+ against **`workflow-result.schema.json`**; failure → **`WORKFLOW_RESULT_INVALID`**.
11. **`manifest.workflowId`** must equal normalized **`WorkflowResult.workflowId`**: else **`AGENT_RUN_WORKFLOW_ID_MISMATCH`**.
12. **Events:** call **`loadEventsForWorkflow`** on **`events.ndjson`**.

**`loadStatus: ok`** is impossible without a valid manifest and steps 2–12 succeeding.

### CLI (normative)

After a successful **`verify-workflow`** (verdict exit **0–2**, stdout **`WorkflowResult`** schema-valid), **`--write-run-bundle <dir>`** creates the directory if needed, writes **`events.ndjson`** (byte copy of **`--events`**), **`workflow-result.json`**, optionally **`workflow-result.sig.json`** when **`--sign-ed25519-private-key`** is set, then **`agent-run.json`**, using the package **`name`** / **`version`** from **`package.json`** as **`producer`**.

### Implementer API

**`buildAgentRunRecordForBundle`** and **`sha256Hex`** live in **`agentRunRecord.ts`** and are re-exported from the package entry. **`verifyRunBundleSignature`**, **`RunBundleSignatureResult`**, **`BundleSignatureCode`**, and all **`BUNDLE_SIGNATURE_*`** constants are re-exported for verifiers.

## Debug Console (normative)

On-call **interactive debugging** is supported by a **local-only** web UI served by the CLI subcommand **`verify-workflow debug --corpus <dir> [--port <n>]`**. The server binds **127.0.0.1** only (no LAN exposure in this MVP). **`npm run build`** copies static assets from **`debug-ui/`** to **`dist/debug-ui/`** next to **`dist/cli.js`**.

### Debug Console audiences

- **Integrator:** Export each run as a **child directory** of the corpus root with the [Agent run record (canonical bundle)](#agent-run-record-canonical-bundle): **`agent-run.json`**, **`workflow-result.json`**, **`events.ndjson`**, and when using signing, **`workflow-result.sig.json`** (fixed names). Optional manifest fields **`customerId`** and **`capturedAt`** (ISO-8601 **`date-time`**) replace the former **`meta.json`** contract.
- **Operator:** Run **`verify-workflow debug --corpus <path>`**, open the printed **http://127.0.0.1:…/** URL. Use **Runs** (filters + pagination), **Patterns** (corpus-wide aggregates), **Compare** (multi-select). Load-failed artifacts appear as **first-class rows** (not omitted).
- **Engineer:** Implementation modules are listed in the Engineer table under [Audiences](#audiences) (`debugCorpus.ts`, `debugFocus.ts`, `debugPatterns.ts`, `debugRunFilters.ts`, `debugRunIndex.ts`, `debugServer.ts`). **`recurrenceSignature`** for pattern aggregation is reused from **`runComparison.ts`**.

### Corpus load outcomes (normative)

Every immediate child directory of **`corpusRoot`** with a safe **`runId`** (no path separators, not **`.`** or **`..`**) is enumerated. For each **`runId`**, the loader produces either **`loadStatus: "ok"`** or **`loadStatus: "error"`**. **Silent omission is forbidden.** Resolved paths must stay under the corpus root; otherwise **`PATH_ESCAPE`**. Error codes include **`MISSING_AGENT_RUN_MANIFEST`**, **`AGENT_RUN_JSON_SYNTAX`**, **`AGENT_RUN_INVALID`**, **`ARTIFACT_LENGTH_MISMATCH`**, **`ARTIFACT_INTEGRITY_MISMATCH`**, **`AGENT_RUN_WORKFLOW_ID_MISMATCH`**, **`MISSING_WORKFLOW_RESULT`**, **`MISSING_EVENTS`**, **`MISSING_WORKFLOW_RESULT_SIGNATURE`**, **`WORKFLOW_RESULT_JSON`**, **`WORKFLOW_RESULT_INVALID`**, **`WORKFLOW_RESULT_RUN_LEVEL_CODES_MISMATCH`**, **`EVENTS_LOAD_FAILED`**.

**`WORKFLOW_RESULT_RUN_LEVEL_CODES_MISMATCH`:** Raised when **`workflow-result.json`** parses as an object with **`schemaVersion` `9`** but **`runLevelCodes`** and **`runLevelReasons`** are misaligned (length mismatch or index **`i`** where **`runLevelCodes[i] !== runLevelReasons[i].code`**). **`message`** is exactly **`Corpus workflow result: runLevelCodes and runLevelReasons are inconsistent.`**

**stderr:** On server start, the CLI prints one line per load error: **`[debug] corpus run "<runId>" load error <code>: <message>`** (mirrors UI-visible failures).

### `capturedAtEffective` (normative)

If **`agentRunRecord.capturedAt`** parses as a valid date, use that instant. **Else** if **`agentRunRecord.verifiedAt`** parses, use that. **Otherwise** use **`mtimeMs`** of **`workflow-result.json`** only (no fallback to **`events.ndjson`** mtime).

### HTTP API (normative)

**`GET /api/health`** → **`{ ok: true }`**.

**`GET /api/runs`** — **server-side filters only** (no full-corpus dump to the client). Query parameters (AND semantics; all optional except as noted):

| Param | Meaning |
|--------|---------|
| **`loadStatus`** | **`ok`** \| **`error`** \| omit = both |
| **`workflowId`** | Exact match on **`loadStatus=ok`** rows only. **`loadStatus=error`** rows remain eligible when **`includeLoadErrors=true`** (default), so broken artifacts stay visible when scoping. |
| **`status`** | **`complete`** \| **`incomplete`** \| **`inconsistent`** (ok rows only) |
| **`failureCategory`** | Actionable category string (ok rows only) |
| **`reasonCode`** | Exact token match against run-level codes and step reason codes on the row |
| **`toolId`** | Ok row has a step with this **`toolId`** |
| **`customerId`** | Exact match; use literal **`__unspecified__`** to match runs with no **`agentRunRecord.customerId`** (ok rows) |
| **`timeFrom` / `timeTo`** | Inclusive range on **`capturedAtEffective`** (milliseconds since epoch) |
| **`includeLoadErrors`** | Default **true**; if **`false`**, error rows are excluded from the listing |

**Pagination:** **`limit`** default **100**, max **500**; **`cursor`** opaque (base64url JSON **`{ offset }`**). Response: **`items`**, **`nextCursor`**, **`totalMatched`**, **`filterEcho`**. Sort: **`runId`** ascending.

**`GET /api/runs/:runId`** — **`200`** always for a known **`runId`**. **`ok`:** success body keys are **exactly** the eleven keys listed under [Debug API (normative success shapes)](#debug-api-normative-success-shapes) (**`runTrustPanelHtml`** included). **`error`:** **`error`**, **`pathsTried`**, optional **`rawPreview`** (first ≤ 8KiB UTF-8 of the failing file when readable), empty **`meta`** in JSON.

**`GET /api/runs/:runId/focus`** — **`200`** with **`{ targets: [{ kind, value, rationale }] }`** from **`buildFocusTargets`** for ok runs; **`409`** **`FOCUS_NOT_AVAILABLE`** for error rows. The browser UI must not reimplement this mapping.

**`POST /api/compare`** — body **`{ runIds: string[] }`** (length ≥ 2). **400** if any run is not loaded ok, or **`COMPARE_WORKFLOW_ID_MISMATCH`**. **`200`** success body keys are **exactly** **`comparePanelHtml`**, **`humanSummary`**, **`report`** (see [Debug API (normative success shapes)](#debug-api-normative-success-shapes)); compare tab uses **`comparePanelHtml`** only for markup.

**`GET /api/corpus-patterns`** — same filter query subset as **`/api/runs`** (no pagination). If more than **10_000** load-ok rows match → **413** JSON **`code: CORPUS_TOO_LARGE`**. If **`workflowId`** is set and more than **50** ok runs match that id → **413** **`PATTERNS_COMPARE_TOO_MANY`**. Otherwise **`200`** body **`schemaVersion: 1`** with **`actionableCategoryHistogram`**, **`topRunLevelCodes`**, **`topStepReasonCodes`**, **`recurrenceCandidates`** (signature **`hitRuns`** across the filtered corpus), and optional **`pairwiseRecurrence`** when **`workflowId`** filter is set and count ≤ 50.

### Example corpus

**`examples/debug-corpus/`** ships one sealed **`ok`** run (**`run_ok`**) for CI and manual smoke. **Negative corpus fixtures** (bad JSON, missing events, schema-invalid **`{}`**) live under **`test/fixtures/corpus-negative/`** and use the same loader; they are not bundled under **`examples/debug-corpus/`**.

## Cross-run comparison (normative)

This section defines **cross-run comparison**: comparing saved workflow artifacts locally (no hosted backend). **Inputs** are validated with **`schemas/workflow-result-compare-input.schema.json`**: each file is exactly one of **`WorkflowEngineResult`** (**`schemaVersion` 7**, or legacy **5** upgraded with empty **`verificationRunContext`**), **frozen v9** **`WorkflowResult`** ([`schemas/workflow-result-v9.schema.json`](../schemas/workflow-result-v9.schema.json); requires **`runLevelCodes`** + **`runLevelReasons`** with per-index alignment), or emitted stdout **`WorkflowResult`** (**`schemaVersion` 13**, or legacy **6–8** / **12** upgraded). The **`oneOf`** order in the schema is **engine v7 → frozen v9 → stdout v13**. Before AJV, v9-shaped inputs must pass the same **`runLevelCodes` / `runLevelReasons`** index rule; failure → exit **3**, **`COMPARE_INPUT_RUN_LEVEL_INCONSISTENT`**, **`message`** **`Compare input workflow result: runLevelCodes and runLevelReasons are inconsistent.`** The CLI normalizes each input to emitted v10 (`finalizeEmittedWorkflowResult`; legacy inputs upgraded as in [Failure analysis](#failure-analysis-normative) and [Actionable failure classification](#actionable-failure-classification-normative)). For **`workflowTruthReport.schemaVersion` ≥ **3**, recomputed truth must match the file (**`util.isDeepStrictEqual`**) — mismatch → exit **3**, **`COMPARE_WORKFLOW_TRUTH_MISMATCH`**). The machine output is **`RunComparisonReport`** (`schemas/run-comparison-report.schema.json`, **`schemaVersion` `3`**), including prior aggregates (**`perRunActionableFailures`**, **`categoryHistogram`**, **`actionableCategoryRecurrence`**) plus required **`reliabilityAssessment`** and **`compareHighlights`**. **Breaking:** saved compare **stdout** files with **`schemaVersion` `2`** are not valid v3 output; re-run compare or upgrade tooling. Behavioral semantics below are authoritative—the schema is structural only (see [`$comment`](../schemas/run-comparison-report.schema.json)).

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
| Four step statuses + retries / divergent seq / unknown tool / malformed line | Yes — `npm test` (SQLite path) + Postgres tests in `npm run test:ci` | — |
| Framework-agnostic capture | Yes — NDJSON contract + examples | Integration list / adapters |
| Manual verification steps ↓, time-to-confirm ↓, trust / re-runs | No | Metrics & study (define counters in ops) |

**Engineering MVP “solved”:** `npm test` and **`npm run test:ci`** pass; CLI obeys exit codes; contracts match this document.

## Examples

Bundled files under [`examples/`](../examples/): `seed.sql`, `tools.json`, `events.ndjson`.

- **Onboarding:** run **`npm start`** or **`npm run first-run`** from the repository root (same command). The onboarding driver is [`scripts/first-run.mjs`](../scripts/first-run.mjs) (`npm run build && node scripts/first-run.mjs`). It seeds `examples/demo.db`, prints plain-language framing plus **human verification reports on stdout** (via a custom **`truthReport`** callback), then verifies workflows `wf_complete` (expect `complete` / `verified`) and `wf_missing` (expect `inconsistent` / `missing` / `ROW_ABSENT`). **`example:workflow-hook`:** run **`npm run example:workflow-hook`** for a minimal **`withWorkflowVerification`** + **`observeStep`** demo (SQLite temp DB, one event from **`examples/events.ndjson`**).
- **CLI log streams:** For the CLI, a **human-readable verification report** is written to **stderr** and the machine-readable **workflow result JSON** to **stdout** on verdict exits **0–2** (default **`truthReport`**); full format is **[Human truth report](#human-truth-report)**. Repository README links use **`docs/execution-truth-layer.md#human-truth-report`** for that section.

(Node may print an experimental warning for `node:sqlite` depending on version.)
