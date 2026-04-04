import { isDeepStrictEqual } from "node:util";
import { CLI_OPERATIONAL_CODES } from "./failureCatalog.js";
import { TruthLayerError } from "./truthLayerError.js";
import type { WorkflowEngineResult, WorkflowResult } from "./types.js";
import { finalizeEmittedWorkflowResult } from "./workflowTruthReport.js";

export function workflowEngineResultFromEmitted(emitted: WorkflowResult): WorkflowEngineResult {
  const { workflowTruthReport: _t, schemaVersion: _s, ...rest } = emitted;
  return { ...rest, schemaVersion: 5 };
}

/**
 * Compare input may be v5 engine JSON or v6 emitted JSON. Returns canonical v6 emitted result.
 * v6 files must have `workflowTruthReport` consistent with recomputation from engine fields.
 */
export function normalizeToEmittedWorkflowResult(
  parsed: WorkflowEngineResult | WorkflowResult,
): WorkflowResult {
  if (parsed.schemaVersion === 5) {
    return finalizeEmittedWorkflowResult(parsed);
  }
  const v6 = parsed;
  const engine = workflowEngineResultFromEmitted(v6);
  const rebuilt = finalizeEmittedWorkflowResult(engine);
  if (!isDeepStrictEqual(rebuilt.workflowTruthReport, v6.workflowTruthReport)) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.COMPARE_WORKFLOW_TRUTH_MISMATCH,
      "workflowTruthReport does not match engine fields (recomputed truth differs from file).",
    );
  }
  return rebuilt;
}
