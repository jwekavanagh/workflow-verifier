# Commercial enforce gate (normative)

Single source of truth for **who may run `agentskeptic enforce`** and how it relates to the **license reserve API**.

## OSS build (`WF_BUILD_PROFILE=oss`, default `npm run build`)

- **`agentskeptic enforce`** is **not supported**. Any invocation **except** help (`--help` or `-h` anywhere in the args after `enforce`) **exits 3** with operational code **`ENFORCE_REQUIRES_COMMERCIAL_BUILD`** and the message constant **`ENFORCE_OSS_GATE_MESSAGE`** in `src/enforceCli.ts` (emitted via `cliErrorEnvelope`).
- **OSS batch / `quick` with `--output-lock`:** supported (writes a **`ci-lock-v1`** fixture after verification; no license reserve). **OSS with `--expect-lock`:** **exits 3** with **`ENFORCE_REQUIRES_COMMERCIAL_BUILD`** and message **`EXPECT_LOCK_REQUIRES_COMMERCIAL_BUILD_MESSAGE`** in [`src/cli/lockOrchestration.ts`](../src/cli/lockOrchestration.ts) (same code as enforce OSS gate; distinct user-facing copy).
- **Commercial `enforce`:** compare-only — **`--output-lock` is rejected** (`ENFORCE_USAGE`); use batch or quick verify with **`--output-lock`** to generate locks, then `enforce` with **`--expect-lock`** (see `src/enforceCli.ts` + `src/cli/lockOrchestration.ts`).
- **`ENFORCE_USAGE`** is **not** emitted on the OSS build for bare `enforce` (commercial gate only). **`ENFORCE_USAGE`** may appear on the **commercial** build for malformed `enforce` arguments (including **`--output-lock`** on enforce).

**Funnel ordering for lock runs** (VS / VO / beacon / partial activation): [`funnel-observability-ssot.md#cli-lock-telemetry-sequencing`](funnel-observability-ssot.md#cli-lock-telemetry-sequencing).

## Help

- If `--help` or `-h` appears in the `enforce` tail args, the CLI prints usage and **exits 0** (OSS and commercial).

## Commercial build (`npm run build:commercial`)

After the OSS gate (skipped when `LICENSE_PREFLIGHT_ENABLED` is true), **`runEnforce`** behaves as follows:

1. `mode = args[0]`.
2. If `mode` is neither `batch` nor `quick` → **`ENFORCE_USAGE`**, exit 3 — **no** license preflight.
3. If `mode === "batch"` → **`runEnforceBatch`**, which calls **`orchestrateEnforceBatchLockRun`** in [`src/cli/lockOrchestration.ts`](../src/cli/lockOrchestration.ts) (reserve **`intent=enforce`**, then **`executeBatchLockFromParsed`** in `src/ciLockWorkflow.ts`).
4. If `mode === "quick"` → **`runEnforceQuick`**, which calls **`orchestrateEnforceQuickLockRun`** in [`src/cli/lockOrchestration.ts`](../src/cli/lockOrchestration.ts) (same pattern for quick).

## License reserve (production)

- The commercial CLI contacts **`POST /api/v1/usage/reserve`** before running lock-gated work: **`intent=verify`** for batch / quick verify with **`--output-lock`** (metered generation), and **`intent=enforce`** for **`agentskeptic enforce`** and for batch / quick verify with **`--expect-lock`**. A real deployment must implement the contract exercised by **`website/__tests__/reserve-route.entitlement.integration.test.ts`** and run under **`npm run validate-commercial`** (see validation index below). Machine-checked: **`test/commercial-license-reserve-intent.test.mjs`** (via **`scripts/commercial-enforce-test-harness.mjs`**).

## MIT / forks

- Forks may remove or alter the OSS gate. This document describes **upstream** default artifacts and documented install paths.

## Machine-checked validation index

Paths below are verified by **`test/docs-commercial-enforce-gate-normative.test.mjs`**. Each must exist as a non-empty file in the repository.

<!-- commercial-enforce-gate-validation-index:start -->

- `website/__tests__/reserve-route.entitlement.integration.test.ts`
- `scripts/validate-commercial-funnel.mjs`
- `scripts/commercial-enforce-test-harness.mjs`
- `test/enforce-oss-forbidden.test.mjs`
- `src/cli/lockOrchestration.ts`
- `test/commercial-license-reserve-intent.test.mjs`
- `src/cli/lockOrchestration.test.ts`
- `test/assurance-cli.test.mjs`

<!-- commercial-enforce-gate-validation-index:end -->
