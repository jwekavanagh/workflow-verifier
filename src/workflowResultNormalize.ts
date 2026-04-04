import { isDeepStrictEqual } from "node:util";
import { CLI_OPERATIONAL_CODES } from "./cliOperationalCodes.js";
import { TruthLayerError } from "./truthLayerError.js";
import type { WorkflowEngineResult, WorkflowResult } from "./types.js";
import { createEmptyVerificationRunContext } from "./verificationRunContext.js";
import { finalizeEmittedWorkflowResult } from "./workflowTruthReport.js";

export function workflowEngineResultFromEmitted(emitted: WorkflowResult): WorkflowEngineResult {
  const {
    workflowTruthReport: _workflowTruthReport,
    schemaVersion: _schemaVersion,
    verificationRunContext: ctxIn,
    ...rest
  } = emitted;
  return {
    ...rest,
    schemaVersion: 6,
    verificationRunContext: ctxIn ?? createEmptyVerificationRunContext(),
  };
}

/**
 * Compare input may be v5 engine JSON or v6+ emitted JSON. Returns canonical v9 emitted result.
 * Files with `workflowTruthReport.schemaVersion >= 3` (including v4 execution-path fields) must match recomputation from engine fields.
 * Legacy truth report `schemaVersion` 1–2 is upgraded without equality check.
 */
export function normalizeToEmittedWorkflowResult(
  parsed: WorkflowEngineResult | WorkflowResult,
): WorkflowResult {
  if ((parsed as { schemaVersion: number }).schemaVersion === 5) {
    const p5 = parsed as unknown as Omit<WorkflowEngineResult, "schemaVersion" | "verificationRunContext"> & {
      schemaVersion: 5;
    };
    const { schemaVersion: _s, ...rest } = p5;
    return finalizeEmittedWorkflowResult({
      ...rest,
      schemaVersion: 6,
      verificationRunContext: createEmptyVerificationRunContext(),
    });
  }
  const emitted = parsed as WorkflowResult;
  const engine = workflowEngineResultFromEmitted(emitted);
  const rebuilt = finalizeEmittedWorkflowResult(engine);
  if (emitted.workflowTruthReport.schemaVersion >= 3) {
    if (!isDeepStrictEqual(rebuilt.workflowTruthReport, emitted.workflowTruthReport)) {
      throw new TruthLayerError(
        CLI_OPERATIONAL_CODES.COMPARE_WORKFLOW_TRUTH_MISMATCH,
        "workflowTruthReport does not match engine fields (recomputed truth differs from file).",
      );
    }
  }
  return rebuilt;
}
