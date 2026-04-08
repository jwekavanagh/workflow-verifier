# CI enforcement (`enforce`)

This document is the **integrator SSOT** for pinning verification outcomes in CI. Lock **shape** is defined only in [`schemas/ci-lock-v1.schema.json`](../schemas/ci-lock-v1.schema.json). **Exit codes and stdout/stderr** for `enforce` are defined only in [workflow-verifier.md — Enforce stream contract (normative)](workflow-verifier.md#enforce-stream-contract-normative).

## What the lock pins (semantics)

The **`ci-lock-v1`** object is a deterministic projection of the verification result:

- **Batch (`kind: batch`):** workflow id and status; verification policy; sorted run-level reason codes; event-sequence integrity summary; per-step tool id, engine status, truth **`outcomeLabel`**, sorted step reason codes, and primary reference code; flattened primary failure-analysis codes; correctness **`enforcementKind`** and **`enforceableProjection`** (or null when complete).
- **Quick (`kind: quick`):** rollup verdict; ingest and header reason codes; per-unit verdict, kind, sorted reason codes, and stable source action identity.

It does **not** replace full **`WorkflowResult`** / **`QuickVerifyReport`** on stdout; it is the **contract** for “this verification run’s correctness-shaped output stayed the same.”

## Automation recipe

1. **Bootstrap (once per scenario):** run  
   `workflow-verifier enforce batch … --output-lock path/to/scenario.ci-lock-v1.json`  
   or  
   `workflow-verifier enforce quick … --output-lock path/to/scenario.ci-lock-v1.json`  
   Commit the file.
2. **CI gate:** run the same command line with **`--expect-lock`** pointing at the committed file instead of **`--output-lock`**. Exactly one of the two flags is required.
3. **Review:** when intentional product changes alter pinned semantics, update the lock in the same change.

Programmatic helpers: **`toCiLockV1`**, **`workflowResultToCiLockV1`**, **`quickReportToCiLockV1`**, **`ciLocksEqualStable`** (package exports).

## Boundaries

- **No** artifact-only enforcement: `enforce` always runs SQL-backed verification before comparing locks.
- **No** parsing human stderr for automation on success paths; use stdout JSON. On **exit 4**, parse the **last** stderr line as the JSON envelope when human text precedes it (see normative stream table).
