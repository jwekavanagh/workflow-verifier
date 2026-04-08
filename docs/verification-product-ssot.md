# Verification product — single source of truth (narrative)

This document is the **authoritative place** for product intent, audiences, onboarding narrative, and **which file owns which contract**. It does **not** duplicate ingest ladders, numeric thresholds, or JSON Schema keyword rules—those stay in the documents linked below.

## Documentation authority matrix

| Subject | Authoritative location | Elsewhere |
|---------|-------------------------|-----------|
| Ingest ladder L0–L5, `extractActions`, thresholds (`T_TABLE`, …), dedupe, decomposition, rollup, CLI phase ordering, registry bytes, human stderr anchor rules | [`quick-verify-normative.md`](quick-verify-normative.md) | Link only; never copy thresholds or ladder text |
| `QuickVerifyReport` JSON shape | [`schemas/quick-verify-report.schema.json`](../schemas/quick-verify-report.schema.json) | Normative doc links schema; no second field catalog |
| User-facing English strings for quick verify (exact wording) | [`src/quickVerify/quickVerifyHumanCopy.ts`](../src/quickVerify/quickVerifyHumanCopy.ts), [`src/quickVerify/formatQuickVerifyHumanReport.ts`](../src/quickVerify/formatQuickVerifyHumanReport.ts) (banner lines), [`src/verificationUserPhrases.ts`](../src/verificationUserPhrases.ts) (reason `user_meaning`) | Appendix H in normative lists **identifiers** only |
| `verifyWorkflow`, batch CLI, registry resolution, Postgres read-only session, `WorkflowResult` | [`execution-truth-layer.md`](execution-truth-layer.md) | This doc links there for batch semantics |
| Repo entry, one copy-paste path | [`README.md`](../README.md) | No algorithm copy |

## Core promise

Given **structured tool activity** and **read-only SQL** (**SQL ground truth**: SQLite or Postgres you can query), verify that **database state matches what the tool calls claimed**—not “handle any log” or “infer everything.” API-only or non-SQL systems are **out of scope**.

## For engineers (first run)

1. **Clone** the repository and **`npm install`**.
2. **`npm run build`** (or **`npm test`**, which builds first).
3. **`npm run first-run`** — creates **`examples/demo.db`** and runs the bundled batch demo (see [`execution-truth-layer.md`](execution-truth-layer.md) onboarding).
4. **Quick verify:**  
   `node dist/cli.js quick --input test/fixtures/quick-verify/pass-line.ndjson --db examples/demo.db --export-registry ./quick-export.json`  
   Paste logs with **`--input -`** (stdin). Optional **`--emit-events`** writes synthetic **`tool_observed`** NDJSON for **exported row tools** only; **`related_exists`** inference is **not** exported to the registry in this release (`contractEligible` is false on those units).

## For integrators

- **Machine contract:** one **stdout** JSON line (`QuickVerifyReport`), **exit code** 0/1/2/3, and on operational failure a **single-line JSON envelope** on stderr.
- **Do not** parse human stderr for automation. stderr begins with three **fixed** anchor lines (see [`quick-verify-normative.md`](quick-verify-normative.md) § A.3a); remaining lines are user-facing only.
- **Contract replay** (repeatable batch path): after quick, run  
  `verify-workflow --workflow-id <id> --events <emit-path> --registry <export-path> --db <sqlitePath>`  
  (or **`--postgres-url`**) with the same DB snapshot. Row tools in the export file align with synthetic events by `toolId` and `seq`.

## For operators

- Verification uses **read-only** SQLite opens and Postgres session guards (see [`execution-truth-layer.md`](execution-truth-layer.md)). Use a **least-privilege** DB user in production.
- **No** writes are performed against the target database for verification.

## Time to first meaningful result (Story 5)

`validate-ttfv` measures only the quick-verify subprocess after a successful build; `npm install` duration is network-bound and excluded. A run that completes within three minutes on CI hardware is sufficient evidence that a typical user can reach a first meaningful result within thirty minutes including reading and copy-paste.

## Why contract replay is row-only (today)

Quick verify exports **`sql_row`** registry entries for high-confidence mappings. **`related_exists`** units remain **inferred-only** in the quick report; repeating them in batch mode requires an explicit registry extension (out of scope for this wedge).
