import { perRunActionableFromWorkflowResult } from "./runComparison.js";
import type { WorkflowResult, WorkflowStatus } from "./types.js";
import type { CorpusRunLoadedOk, CorpusRunOutcome } from "./debugCorpus.js";

const UNSPECIFIED_CUSTOMER = "__unspecified__";

export type RunListItem = {
  runId: string;
  loadStatus: "ok" | "error";
  workflowId?: string;
  status?: WorkflowStatus;
  /** Actionable category from truth report rollup (`complete` when trusted). */
  actionableCategory?: string | null;
  toolIds: string[];
  customerId: string;
  primaryReasonCodes: string[];
  /** Sorted unique `executionPathFindings[].code` from workflow truth report. */
  pathFindingCodes: string[];
  capturedAtEffectiveMs: number;
  error?: { code: string; message: string };
};

function primaryCodesFromResult(r: WorkflowResult): string[] {
  const set = new Set<string>();
  for (const c of r.runLevelCodes) set.add(c);
  for (const s of r.steps) {
    const first = s.reasons[0]?.code;
    if (first) set.add(first);
    for (const rr of s.reasons) set.add(rr.code);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })).slice(0, 40);
}

export function effectiveCustomerId(meta: { customerId?: string } | undefined): string {
  if (meta?.customerId !== undefined && meta.customerId !== "") return meta.customerId;
  return UNSPECIFIED_CUSTOMER;
}

export function runListItemFromOutcome(outcome: CorpusRunOutcome, runIndex: number): RunListItem {
  if (outcome.loadStatus === "error") {
    return {
      runId: outcome.runId,
      loadStatus: "error",
      toolIds: [],
      customerId: effectiveCustomerId(undefined),
      primaryReasonCodes: [outcome.error.code],
      pathFindingCodes: [],
      capturedAtEffectiveMs: outcome.capturedAtEffectiveMs,
      error: { code: outcome.error.code, message: outcome.error.message },
    };
  }
  return runListItemFromOk(outcome, runIndex);
}

function pathCodesFromResult(r: WorkflowResult): string[] {
  const codes = r.workflowTruthReport.executionPathFindings.map((f) => f.code);
  return [...new Set(codes)].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function runListItemFromOk(o: CorpusRunLoadedOk, runIndex: number): RunListItem {
  const r = o.workflowResult;
  const actionable = perRunActionableFromWorkflowResult(r, runIndex);
  const toolIds = [...new Set(r.steps.map((s) => s.toolId))].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
  return {
    runId: o.runId,
    loadStatus: "ok",
    workflowId: r.workflowId,
    status: r.status,
    actionableCategory: actionable.category,
    toolIds,
    customerId: effectiveCustomerId(o.meta),
    primaryReasonCodes: primaryCodesFromResult(r),
    pathFindingCodes: pathCodesFromResult(r),
    capturedAtEffectiveMs: o.capturedAtEffectiveMs,
  };
}

export { UNSPECIFIED_CUSTOMER };
