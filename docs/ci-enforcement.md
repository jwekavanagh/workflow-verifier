# CI enforcement (`enforce`)

**Policy:** CI lock gating requires a **commercial** CLI build and license API; the OSS repo default build does not run **`enforce`** — see **[`docs/commercial-enforce-gate-normative.md`](commercial-enforce-gate-normative.md)**.

This document is the **integrator SSOT** for pinning verification outcomes in CI. Lock **shape** is defined only in [`schemas/ci-lock-v1.schema.json`](../schemas/ci-lock-v1.schema.json). **Exit codes and stdout/stderr** for `enforce` are defined only in [agentskeptic.md — Enforce stream contract (normative)](agentskeptic.md#enforce-stream-contract-normative).

## Prerequisites (commercial CLI)

On the **commercial** build, **licensed** contract **`verify`**, **`quick`**, **`--expect-lock`**, and **`enforce`** require an **Individual**, **Team**, **Business**, or **Enterprise** plan with an **active** subscription (Stripe **trialing** counts) and a valid API key on **`POST /api/v1/usage/reserve`**; **`--output-lock`** uses **`intent=verify`** (see [`commercial-entitlement-policy.md`](commercial-entitlement-policy.md)). The **OSS** build supports **`--output-lock`** on batch / quick **without** a key; it does **not** support **`--expect-lock`** or **`enforce`** — see [`commercial-enforce-gate-normative.md`](commercial-enforce-gate-normative.md).

## What the lock pins (semantics)

The **`ci-lock-v1`** object is a deterministic projection of the verification result:

- **Batch (`kind: batch`):** workflow id and status; verification policy; sorted run-level reason codes; event-sequence integrity summary; per-step tool id, engine status, truth **`outcomeLabel`**, sorted step reason codes, and primary reference code; flattened primary failure-analysis codes; correctness **`enforcementKind`** and **`enforceableProjection`** (or null when complete).
- **Quick (`kind: quick`):** rollup verdict; ingest and header reason codes; per-unit verdict, kind, sorted reason codes, and stable source action identity.

It does **not** replace full **`WorkflowResult`** / **`QuickVerifyReport`** on stdout; it is the **contract** for “this verification run’s correctness-shaped output stayed the same.”

## Automation recipe

**Generate locks:** append **`--output-lock <path>`** to batch verify or **`quick`** (OSS or commercial). **Compare in CI (commercial):** use the same command with **`--expect-lock <path>`**, or run **`agentskeptic enforce batch|quick --expect-lock <path> …`** (**compare-only** — **`--output-lock` is not accepted** on `enforce`; generate locks with verify / quick first).

1. **Bootstrap (once per scenario):** run, for example,  
   `agentskeptic --workflow-id … --events … --registry … --db … --output-lock path/to/scenario.ci-lock-v1.json`  
   or  
   `agentskeptic quick --input … --db … --export-registry … --output-lock path/to/scenario.ci-lock-v1.json`  
   Commit the file.
2. **CI gate:** run the **same** command with **`--expect-lock`** pointing at the committed file instead of **`--output-lock`**. Exactly one of the two flags is required.
3. **Review:** when intentional product changes alter pinned semantics, update the lock in the same change.

Programmatic helpers: **`toCiLockV1`**, **`workflowResultToCiLockV1`**, **`quickReportToCiLockV1`**, **`ciLocksEqualStable`** (package exports).

## Boundaries

- **No** artifact-only enforcement: `enforce` always runs SQL-backed verification before comparing locks.
- **No** parsing human stderr for automation on success paths; use stdout JSON. On **exit 4**, parse the **last** stderr line as the JSON envelope when human text precedes it (see normative stream table).
