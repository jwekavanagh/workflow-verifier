import {
  CLI_OPERATIONAL_CODES,
  cliErrorEnvelope,
  formatOperationalMessage,
} from "./failureCatalog.js";
import { TruthLayerError } from "./truthLayerError.js";
import { LICENSE_PREFLIGHT_ENABLED } from "./generated/commercialBuildFlags.js";
import { orchestrateEnforceBatchLockRun, orchestrateEnforceQuickLockRun } from "./cli/lockOrchestration.js";

/** User-facing message for OSS builds when `enforce` is invoked; exported for tests. */
export const ENFORCE_OSS_GATE_MESSAGE =
  "The OSS build cannot run agentskeptic enforce (CI lock gating). Install the published npm package agentskeptic, set AGENTSKEPTIC_API_KEY (legacy WORKFLOW_VERIFIER_API_KEY accepted), and point COMMERCIAL_LICENSE_API_BASE_URL at your license server; or run npm run build:commercial with COMMERCIAL_LICENSE_API_BASE_URL set. Policy: docs/commercial-enforce-gate-normative.md";

function writeCliError(code: string, message: string): void {
  console.error(cliErrorEnvelope(code, message));
}

function usageEnforce(): string {
  return `Usage:
  agentskeptic enforce batch --expect-lock <path> <same flags as batch verify>
  agentskeptic enforce quick --expect-lock <path> <same flags as quick>

Compare-only: --expect-lock is required. Generate locks with batch or quick verify using --output-lock.

Exit codes (batch): same as batch verify for 0–2; 3 operational; 4 lock mismatch.
Exit codes (quick): same as quick for 0–2; 3 operational; 4 lock mismatch.

See docs/ci-enforcement.md and docs/agentskeptic.md.

  --help, -h  print this message and exit 0`;
}

async function runEnforceBatch(restArgs: string[]): Promise<void> {
  try {
    await orchestrateEnforceBatchLockRun(restArgs);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    process.exit(3);
  }
}

async function runEnforceQuick(restArgs: string[]): Promise<void> {
  try {
    await orchestrateEnforceQuickLockRun(restArgs);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    process.exit(3);
  }
}

export async function runEnforce(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usageEnforce());
    process.exit(0);
  }
  if (!LICENSE_PREFLIGHT_ENABLED) {
    writeCliError(CLI_OPERATIONAL_CODES.ENFORCE_REQUIRES_COMMERCIAL_BUILD, ENFORCE_OSS_GATE_MESSAGE);
    process.exit(3);
  }
  const mode = args[0];
  if (mode === "batch") {
    await runEnforceBatch(args.slice(1));
    return;
  }
  if (mode === "quick") {
    await runEnforceQuick(args.slice(1));
    return;
  }
  writeCliError(
    CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
    'enforce requires "batch" or "quick" immediately after enforce.',
  );
  process.exit(3);
}
