import type { ExecutionTraceView, FailureAnalysisEvidenceItem, WorkflowResult } from "./types.js";

export type FocusTargetKind = "seq" | "ingestIndex" | "runEventId";

export type FocusTarget = {
  kind: FocusTargetKind;
  value: number | string;
  rationale: string;
};

export type FocusResponse = {
  targets: FocusTarget[];
};

function pushUnique(targets: FocusTarget[], t: FocusTarget): void {
  const key = `${t.kind}:${String(t.value)}`;
  if (targets.some((x) => `${x.kind}:${String(x.value)}` === key)) return;
  targets.push(t);
}

function fromEvidenceItem(ev: FailureAnalysisEvidenceItem, i: number): FocusTarget[] {
  const out: FocusTarget[] = [];
  const base = `failureAnalysis.evidence[${i}]`;
  if (ev.seq !== undefined) {
    out.push({
      kind: "seq",
      value: ev.seq,
      rationale: `${base} scope=${ev.scope} seq=${ev.seq}`,
    });
  }
  if (ev.ingestIndex !== undefined) {
    out.push({
      kind: "ingestIndex",
      value: ev.ingestIndex,
      rationale: `${base} scope=${ev.scope} ingestIndex=${ev.ingestIndex}`,
    });
  }
  if (ev.runEventId != null && ev.runEventId !== "") {
    out.push({
      kind: "runEventId",
      value: ev.runEventId,
      rationale: `${base} scope=${ev.scope} runEventId=${ev.runEventId}`,
    });
  }
  return out;
}

/**
 * Maps structured failure analysis to trace / step navigation targets.
 * Pure: safe to test with golden vectors.
 */
export function buildFocusTargets(workflowResult: WorkflowResult, _trace: ExecutionTraceView): FocusResponse {
  const fa = workflowResult.workflowTruthReport.failureAnalysis;
  if (fa === null) {
    return { targets: [] };
  }
  const targets: FocusTarget[] = [];
  for (let i = 0; i < fa.evidence.length; i++) {
    const ev = fa.evidence[i]!;
    for (const t of fromEvidenceItem(ev, i)) {
      pushUnique(targets, t);
    }
  }
  return { targets };
}
