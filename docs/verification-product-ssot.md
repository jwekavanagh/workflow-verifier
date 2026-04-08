# Verification product — single source of truth (narrative)

This document is the **authoritative place** for product intent, audiences, onboarding narrative, and **which file owns which contract**. It does **not** duplicate ingest ladders, numeric thresholds, or JSON Schema keyword rules—those stay in the documents linked below.

## What this does **not** prove (trust boundary)

Across **Quick Verify** and **contract** verification:

- This does **not** prove that a tool call **actually executed** or that an effect **actually ran**—only that **observed database state** matched **expectations** when checked.
- This does **not** prove that a **change occurred** (or did not occur)—verification is a **snapshot**: current SQL state vs expected state.
- This **only** proves **state matches declared or inferred expectations** under the configured rules—not “execution correctness” or causality.

**Declared vs expected vs observed** (first-class mental model; echoed on stdout as `productTruth.layers` on `QuickVerifyReport`):

1. **Declared** — What structured **tool activity** encodes (tool identity and parameters extracted from ingest).
2. **Expected** — What should hold in SQL: **quick** = **inferred** from declared parameters (provisional); **contract** = **registry-resolved** from events.
3. **Observed** — What **read-only SQL** returned at verification time.

## Product category

You are a **state verification engine for agent-driven systems** that have **SQL ground truth**. You are **not** a logging, tracing, or general observability product, and you are **not** a substitute for tests of application code paths.

## Who should **not** use this (ICP exclusion)

- Teams **without** **structured tool activity** (JSON describing tool calls and parameters)—there is **no** “paste any logs” path.
- Teams **without** **SQL-accessible** authoritative state.
- Teams that need **causal** or **execution** guarantees, not **state–expectation** checks.
- Teams expecting **plug-and-play** ingestion without aligning to the **event / ingest model**.

## Documentation authority matrix

| Subject | Authoritative location | Elsewhere |
|---------|-------------------------|-----------|
| Ingest ladder L0–L5, `extractActions`, thresholds (`T_TABLE`, …), dedupe, decomposition, rollup, CLI phase ordering, registry bytes, human stderr anchor rules | [`quick-verify-normative.md`](quick-verify-normative.md) | Link only; never copy thresholds or ladder text |
| `QuickVerifyReport` JSON shape (`schemaVersion` **3**, `productTruth`, `units[].correctnessDefinition` on non-pass, …) | [`schemas/quick-verify-report.schema.json`](../schemas/quick-verify-report.schema.json) | Normative doc links schema; no second field catalog |
| **Correctness definition** (forward MUST + `enforceableProjection` on batch truth + quick non-pass units) | [`correctness-definition-normative.md`](correctness-definition-normative.md), [`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json) | Batch human stderr: `correctness_definition:` in [`workflow-verifier.md`](workflow-verifier.md); trust boundary unchanged |
| User-facing English strings for quick verify (exact wording) | [`src/quickVerify/quickVerifyHumanCopy.ts`](../src/quickVerify/quickVerifyHumanCopy.ts), [`src/quickVerify/formatQuickVerifyHumanReport.ts`](../src/quickVerify/formatQuickVerifyHumanReport.ts) (banner lines), [`src/quickVerify/quickVerifyProductTruth.ts`](../src/quickVerify/quickVerifyProductTruth.ts) (stdout `productTruth`), [`src/verificationUserPhrases.ts`](../src/verificationUserPhrases.ts) (reason `user_meaning`) | Appendix H in normative lists **identifiers** only |
| `verifyWorkflow`, batch CLI, registry resolution, Postgres read-only session, `WorkflowResult` | [`workflow-verifier.md`](workflow-verifier.md) | This doc links there for batch semantics |
| **CI enforcement** (`enforce`, `ci-lock-v1`, bootstrap vs expect-lock recipe) | [`ci-enforcement.md`](ci-enforcement.md), [`schemas/ci-lock-v1.schema.json`](../schemas/ci-lock-v1.schema.json), [Enforce stream contract](workflow-verifier.md#enforce-stream-contract-normative) in [`workflow-verifier.md`](workflow-verifier.md) | Lock field list only in schema; streams only in workflow-verifier |
| Repo entry, onboarding path | [`README.md`](../README.md) | No algorithm copy |

## Core promise

Given **structured tool activity** (not arbitrary logs) and **read-only SQL** (**SQL ground truth**: SQLite or Postgres you can query), verify that **observed database state matches expectations** derived from that activity and (in contract mode) the registry—not “handle any log” or “infer everything.” API-only or non-SQL systems are **out of scope**.

## Quick Verify positioning

Quick Verify is **provisional**: inference-based mapping, **uncertain** as a normal rollup outcome, and rollup **pass** **must not** be read as production safety or audit-final. Authoritative framing is on every stdout report: **`productTruth`** (`doesNotProve`, `layers`, `quickVerifyProvisional`, `contractReplayPartialCoverage`). Human stderr repeats the same themes in fixed banners after the three anchors.

## Contract replay is partial coverage

**Export → replay** verifies **exported row tools** against synthetic events and the exported registry. It is **not** full-fidelity replay of everything Quick Verify may have inferred (**`related_exists`** and other contract rules are not fully carried by the export). Operators must not treat “I ran quick → replay → verified” as blanket coverage.

## For engineers (first run)

1. **Clone** the repository and **`npm install`**.
2. **`npm run build`** (or **`npm test`**, which builds first).
3. **`npm run first-run`** — creates **`examples/demo.db`** and runs the bundled batch demo (see [`workflow-verifier.md`](workflow-verifier.md) onboarding).
4. **Quick verify:**  
   `node dist/cli.js quick --input test/fixtures/quick-verify/pass-line.ndjson --db examples/demo.db --export-registry ./quick-export.json`  
   Supply structured tool activity on **stdin** with **`--input -`** when convenient. Optional **`--emit-events`** writes synthetic **`tool_observed`** NDJSON for **exported row tools** only; **`related_exists`** inference is **not** exported to the registry in this release (`contractEligible` is false on those units).

## For integrators

- **Machine contract:** one **stdout** JSON line (`QuickVerifyReport`, **`schemaVersion` 3**), **exit code** 0/1/2/3, and on operational failure a **single-line JSON envelope** on stderr.
- **Do not** parse human stderr for automation. stderr begins with three **fixed** anchor lines (see [`quick-verify-normative.md`](quick-verify-normative.md) § A.3a); remaining lines are user-facing only.
- **Contract replay** (repeatable batch path, **partial** vs quick scope): after quick, run  
  `verify-workflow --workflow-id <id> --events <emit-path> --registry <export-path> --db <sqlitePath>`  
  (or **`--postgres-url`**) with the same DB snapshot. Row tools in the export file align with synthetic events by `toolId` and `seq`. Treat this as **row-tool replay**, not “everything quick checked is now contract-checked.”

## For operators

- Verification uses **read-only** SQLite opens and Postgres session guards (see [`workflow-verifier.md`](workflow-verifier.md)). Use a **least-privilege** DB user in production.
- **No** writes are performed against the target database for verification.

## Time to first meaningful result (Story 5)

`validate-ttfv` (see [`scripts/validate-ttfv.mjs`](../scripts/validate-ttfv.mjs) and [`scripts/lib/quickVerifyPostbuildGate.mjs`](../scripts/lib/quickVerifyPostbuildGate.mjs)) runs **after** a successful **`npm run build`**. It enforces a **spawn timeout** and post-run wall clock (**120s**), parses the **stdout** **`QuickVerifyReport`** line (**`schemaVersion` 3**), and checks that the **exported registry file** matches **`canonicalToolsArrayUtf8`** of the report’s tools. `npm install` duration is network-bound and excluded. A run that completes within three minutes on CI hardware is sufficient evidence that a typical user can reach a first meaningful result within thirty minutes including reading the README and supplying structured tool activity (file or stdin).

## Why contract replay is row-only (today)

Quick verify exports **`sql_row`** registry entries for high-confidence mappings. **`related_exists`** units remain **inferred-only** in the quick report; repeating them in batch mode requires an explicit registry extension (out of scope for this wedge). This is a **coverage boundary**, not a promise of end-to-end parity between quick and contract runs.
