import { createEmptyVerificationRunContext } from "./verificationRunContext.js";
import type { ExecutionPathEvidenceItem, ExecutionPathFinding, StepOutcome, WorkflowEngineResult } from "./types.js";

/** Reason codes from `resolveExpectation` / registry resolution + pipeline `UNKNOWN_TOOL`. */
export const ACTION_INPUT_REASON_CODES: ReadonlySet<string> = new Set([
  "UNKNOWN_TOOL",
  "CONST_STRING_EMPTY",
  "STRING_SPEC_POINTER_MISSING",
  "STRING_SPEC_TYPE",
  "STRING_SPEC_EMPTY",
  "KEY_VALUE_POINTER_MISSING",
  "KEY_VALUE_NOT_SCALAR",
  "KEY_VALUE_SPEC_INVALID",
  "TABLE_POINTER_INVALID",
  "TABLE_SPEC_INVALID",
  "INVALID_IDENTIFIER",
  "REQUIRED_FIELDS_POINTER_MISSING",
  "REQUIRED_FIELDS_NOT_OBJECT",
  "REQUIRED_FIELDS_VALUE_UNDEFINED",
  "REQUIRED_FIELDS_VALUE_NOT_SCALAR",
  "UNSUPPORTED_VERIFICATION_KIND",
  "DUPLICATE_EFFECT_ID",
]);

/**
 * Step-level reason codes produced only after SQL reconciliation / rollup.
 * Execution-path findings must never use these as top-level `finding.code`
 * and must not emit path rows driven solely by these (remain on SQL axis).
 */
export const RECONCILER_STEP_REASON_CODES: ReadonlySet<string> = new Set([
  "ROW_ABSENT",
  "VALUE_MISMATCH",
  "ROW_NOT_OBSERVED_WITHIN_WINDOW",
  "DUPLICATE_ROWS",
  "MULTI_EFFECT_PARTIAL",
  "MULTI_EFFECT_ALL_FAILED",
  "MULTI_EFFECT_INCOMPLETE",
  "MULTI_EFFECT_UNCERTAIN_WITHIN_WINDOW",
]);

/** Every allowed top-level execution-path finding `code` (for tests / validation). */
export const EXECUTION_PATH_FINDING_CODES: ReadonlySet<string> = new Set([
  "RETRIEVAL_EMPTY",
  "RETRIEVAL_ERROR",
  "RETRIEVAL_THIN_HITS",
  "NO_RETRIEVAL_EVENTS",
  "MODEL_TURN_ABNORMAL",
  "CONTROL_INTERRUPT",
  "BRANCH_OR_GATE_SKIPPED",
  "TOOL_SKIPPED",
  "ACTION_INPUT_RESOLUTION_FAILED",
  "MISSING_RUN_COMPLETED",
  "LOGICAL_STEP_RETRIES",
  "RETRY_OBSERVATIONS_DIVERGE",
  "LAST_EVENT_MODEL_ABNORMAL",
  "RUN_LEVEL_INGEST_ISSUES",
  "EVENT_SEQUENCE_IRREGULAR",
]);

function pushFinding(
  out: ExecutionPathFinding[],
  f: Omit<ExecutionPathFinding, "evidence"> & { evidence: ExecutionPathEvidenceItem },
): void {
  out.push({
    code: f.code,
    severity: f.severity,
    concernCategory: f.concernCategory,
    message: f.message,
    evidence: f.evidence,
  });
}

function dedupeFindings(findings: ExecutionPathFinding[]): ExecutionPathFinding[] {
  const seen = new Set<string>();
  const out: ExecutionPathFinding[] = [];
  for (const f of findings) {
    const ing = f.evidence.ingestIndex ?? -1;
    const seq = f.evidence.seq ?? -1;
    const tid = f.evidence.toolId ?? "";
    const key = `${f.code}\0${ing}\0${seq}\0${tid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/** Deterministic execution-path findings (orthogonal to SQL end-state verdicts). */
export function buildExecutionPathFindings(engine: WorkflowEngineResult): ExecutionPathFinding[] {
  const ctx = engine.verificationRunContext ?? createEmptyVerificationRunContext();
  const out: ExecutionPathFinding[] = [];

  if (engine.runLevelReasons.length > 0) {
    const codes = [...new Set(engine.runLevelReasons.map((r) => r.code))].sort((a, b) =>
      a.localeCompare(b),
    );
    pushFinding(out, {
      code: "RUN_LEVEL_INGEST_ISSUES",
      severity: "high",
      concernCategory: "capture_integrity",
      message: `Run-level ingest or parse issues (${codes.join(", ")}).`,
      evidence: { scope: "run_level", codes },
    });
  }

  if (engine.eventSequenceIntegrity.kind === "irregular") {
    const codes = [...new Set(engine.eventSequenceIntegrity.reasons.map((r) => r.code))].sort((a, b) =>
      a.localeCompare(b),
    );
    pushFinding(out, {
      code: "EVENT_SEQUENCE_IRREGULAR",
      severity: "medium",
      concernCategory: "capture_integrity",
      message: `Event capture order or timestamps were irregular (${codes.join(", ")}).`,
      evidence: { scope: "event_sequence", codes },
    });
  }

  for (const r of ctx.retrievalEvents) {
    if (r.status === "empty") {
      pushFinding(out, {
        code: "RETRIEVAL_EMPTY",
        severity: "high",
        concernCategory: "context_quality",
        message: `Retrieval from "${r.source}" returned empty.`,
        evidence: {
          scope: "run_context",
          ingestIndex: r.ingestIndex,
          source: r.source,
          runEventId: r.runEventId,
          codes: ["RETRIEVAL_EMPTY"],
        },
      });
    } else if (r.status === "error") {
      pushFinding(out, {
        code: "RETRIEVAL_ERROR",
        severity: "high",
        concernCategory: "context_quality",
        message: `Retrieval from "${r.source}" failed.`,
        evidence: {
          scope: "run_context",
          ingestIndex: r.ingestIndex,
          source: r.source,
          runEventId: r.runEventId,
          codes: ["RETRIEVAL_ERROR"],
        },
      });
    } else if (r.status === "ok" && r.hitCount !== undefined && r.hitCount === 0) {
      pushFinding(out, {
        code: "RETRIEVAL_THIN_HITS",
        severity: "medium",
        concernCategory: "context_quality",
        message: `Retrieval from "${r.source}" reported ok with hitCount 0.`,
        evidence: {
          scope: "run_context",
          ingestIndex: r.ingestIndex,
          source: r.source,
          runEventId: r.runEventId,
          codes: ["RETRIEVAL_THIN_HITS"],
        },
      });
    }
  }

  if (
    ctx.maxWireSchemaVersion === 2 &&
    ctx.retrievalEvents.length === 0 &&
    ctx.firstToolObservedIngestIndex !== null
  ) {
    pushFinding(out, {
      code: "NO_RETRIEVAL_EVENTS",
      severity: "low",
      concernCategory: "context_quality",
      message: "No retrieval events recorded before tool observations (coarse missing-context signal).",
      evidence: { scope: "run_context", codes: ["NO_RETRIEVAL_EVENTS"] },
    });
  }

  for (const m of ctx.modelTurnEvents) {
    if (m.status === "error" || m.status === "aborted" || m.status === "incomplete") {
      pushFinding(out, {
        code: "MODEL_TURN_ABNORMAL",
        severity: "high",
        concernCategory: "decision_execution",
        message: `Model turn ended with status ${m.status}.`,
        evidence: {
          scope: "run_context",
          ingestIndex: m.ingestIndex,
          runEventId: m.runEventId,
          codes: [`MODEL_TURN_${m.status.toUpperCase()}`],
        },
      });
    }
  }

  for (const c of ctx.controlEvents) {
    if (c.controlKind === "interrupt") {
      pushFinding(out, {
        code: "CONTROL_INTERRUPT",
        severity: "high",
        concernCategory: "decision_execution",
        message: "Control interrupt recorded in run graph.",
        evidence: {
          scope: "run_context",
          ingestIndex: c.ingestIndex,
          runEventId: c.runEventId,
          codes: ["CONTROL_INTERRUPT"],
        },
      });
    } else if (
      (c.controlKind === "branch" || c.controlKind === "gate") &&
      c.decision === "skipped"
    ) {
      pushFinding(out, {
        code: "BRANCH_OR_GATE_SKIPPED",
        severity: "medium",
        concernCategory: "decision_execution",
        message: `${c.controlKind} path was skipped.`,
        evidence: {
          scope: "run_context",
          ingestIndex: c.ingestIndex,
          runEventId: c.runEventId,
          codes: [`CONTROL_${c.controlKind.toUpperCase()}_SKIPPED`],
        },
      });
    }
  }

  for (const s of ctx.toolSkippedEvents) {
    pushFinding(out, {
      code: "TOOL_SKIPPED",
      severity: "medium",
      concernCategory: "tool_selection_execution",
      message: `Tool ${s.toolId} was skipped.`,
      evidence: {
        scope: "run_context",
        ingestIndex: s.ingestIndex,
        toolId: s.toolId,
        codes: ["TOOL_SKIPPED"],
      },
    });
  }

  for (const step of engine.steps) {
    if (step.status === "incomplete_verification") {
      const primary = step.reasons[0]?.code;
      if (primary !== undefined && ACTION_INPUT_REASON_CODES.has(primary)) {
        pushFinding(out, {
          code: "ACTION_INPUT_RESOLUTION_FAILED",
          severity: "high",
          concernCategory: "action_inputs_invalid",
          message: `Tool ${step.toolId} at seq ${step.seq}: parameter/registry resolution failed (${primary}).`,
          evidence: {
            scope: "step",
            seq: step.seq,
            toolId: step.toolId,
            codes: [primary],
          },
        });
      } else if (primary === "RETRY_OBSERVATIONS_DIVERGE") {
        pushFinding(out, {
          code: "RETRY_OBSERVATIONS_DIVERGE",
          severity: "medium",
          concernCategory: "workflow_completeness",
          message: `Seq ${step.seq} tool ${step.toolId}: repeated observations diverged.`,
          evidence: {
            scope: "step",
            seq: step.seq,
            toolId: step.toolId,
            codes: [primary],
          },
        });
      }
    }
    if (step.repeatObservationCount > 1) {
      pushFinding(out, {
        code: "LOGICAL_STEP_RETRIES",
        severity: "low",
        concernCategory: "workflow_completeness",
        message: `Seq ${step.seq} tool ${step.toolId}: ${step.repeatObservationCount} observations for one logical step.`,
        evidence: {
          scope: "step",
          seq: step.seq,
          toolId: step.toolId,
          codes: ["LOGICAL_STEP_RETRIES"],
        },
      });
    }
  }

  if (
    ctx.maxWireSchemaVersion === 2 &&
    ctx.firstToolObservedIngestIndex !== null &&
    !ctx.hasRunCompletedControl
  ) {
    pushFinding(out, {
      code: "MISSING_RUN_COMPLETED",
      severity: "medium",
      concernCategory: "workflow_completeness",
      message: "No run_completed control event after tool observations (v2 graph).",
      evidence: { scope: "run_context", codes: ["MISSING_RUN_COMPLETED"] },
    });
  }

  const last = ctx.lastRunEvent;
  if (
    last !== null &&
    last.type === "model_turn" &&
    last.modelTurnStatus !== undefined &&
    last.modelTurnStatus !== "completed"
  ) {
    pushFinding(out, {
      code: "LAST_EVENT_MODEL_ABNORMAL",
      severity: "high",
      concernCategory: "workflow_completeness",
      message: `Last captured event is model_turn with status ${last.modelTurnStatus}.`,
      evidence: {
        scope: "run_context",
        ingestIndex: last.ingestIndex,
        codes: [`MODEL_TURN_${last.modelTurnStatus.toUpperCase()}`],
      },
    });
  }

  const deduped = dedupeFindings(out);
  for (const f of deduped) {
    if (!EXECUTION_PATH_FINDING_CODES.has(f.code)) {
      throw new Error(`Internal error: unknown execution path finding code ${f.code}`);
    }
    if (RECONCILER_STEP_REASON_CODES.has(f.code)) {
      throw new Error(`Internal error: reconciler code leaked into path finding: ${f.code}`);
    }
  }
  return deduped;
}

const SUMMARY_V1_NO_CONCERNS =
  "Full upstream execution-path visibility requires schemaVersion 2 run events (retrieval, model_turn, control, tool_skipped) with run graph fields.";
const SUMMARY_V2_CLEAR = "No execution-path concerns detected under current rules.";

export function buildExecutionPathSummary(
  findings: ExecutionPathFinding[],
  maxWireSchemaVersion: 1 | 2,
): string {
  if (findings.length === 0) {
    return maxWireSchemaVersion === 1 ? SUMMARY_V1_NO_CONCERNS : SUMMARY_V2_CLEAR;
  }
  const codes = [...new Set(findings.map((f) => f.code))].sort((a, b) => a.localeCompare(b));
  return `execution_path_concerns=${findings.length}; codes=${codes.join(",")}`;
}
