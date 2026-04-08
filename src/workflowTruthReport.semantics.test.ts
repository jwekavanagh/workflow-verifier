import { describe, expect, it } from "vitest";
import {
  failureDiagnosticForRunLevelCode,
  failureDiagnosticForStep,
  formatVerificationTargetSummary,
} from "./verificationDiagnostics.js";
import type { StepOutcome, WorkflowEngineResult } from "./types.js";
import { buildExecutionPathSummary } from "./executionPathFindings.js";
import {
  STEP_STATUS_TRUTH_LABELS,
  TRUST_LINE_UNCERTAIN_WITHIN_WINDOW,
  buildWorkflowTruthReport,
} from "./workflowTruthReport.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import { createEmptyVerificationRunContext } from "./verificationRunContext.js";

const emptyCtx = createEmptyVerificationRunContext();

const strongPolicy = {
  consistencyMode: "strong" as const,
  verificationWindowMs: 0,
  pollIntervalMs: 0,
};

function verifiedStep(seq: number, toolId: string): StepOutcome {
  return {
    seq,
    toolId,
    intendedEffect: { narrative: "ok" },
    observedExecution: { paramsCanonical: "{}" },
    verificationRequest: {
      kind: "sql_row",
      table: "t",
      identityEq: [{ column: "id", value: "1" }],
      requiredFields: {},
    },
    status: "verified",
    reasons: [],
    evidenceSummary: {},
    repeatObservationCount: 1,
    evaluatedObservationOrdinal: 1,
  };
}

describe("buildWorkflowTruthReport (formatter-independent semantics)", () => {
  it("complete all verified: trust line and VERIFIED labels", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "complete",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: emptyCtx,
      steps: [verifiedStep(0, "t1")],
    };
    const truth = buildWorkflowTruthReport(engine);
    expect(truth.schemaVersion).toBe(9);
    expect(truth.failureAnalysis).toBeNull();
    expect(truth.failureExplanation).toBeNull();
    expect(truth.executionPathFindings).toEqual([]);
    expect(truth.executionPathSummary).toBe(
      buildExecutionPathSummary([], emptyCtx.maxWireSchemaVersion),
    );
    expect(truth.workflowId).toBe("w");
    expect(truth.workflowStatus).toBe("complete");
    expect(truth.trustSummary).toBe(
      "TRUSTED: Every step matched the database under the configured verification rules.",
    );
    expect(truth.runLevelIssues).toEqual([]);
    expect(truth.eventSequence).toEqual({ kind: "normal" });
    expect(truth.steps[0]!.outcomeLabel).toBe("VERIFIED");
    expect(truth.steps[0]!.failureCategory).toBeUndefined();
    expect(loadSchemaValidator("workflow-truth-report")(truth)).toBe(true);
  });

  it("inconsistent missing step: outcome label and failure category", () => {
    const vr = {
      kind: "sql_row" as const,
      table: "contacts",
      identityEq: [{ column: "id", value: "x" }],
      requiredFields: {},
    };
    const step: StepOutcome = {
      seq: 0,
      toolId: "t",
      intendedEffect: { narrative: "" },
      observedExecution: { paramsCanonical: "{}" },
      verificationRequest: vr,
      status: "missing",
      reasons: [{ code: "ROW_ABSENT", message: "m" }],
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
      failureDiagnostic: "workflow_execution",
    };
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: emptyCtx,
      steps: [step],
    };
    const truth = buildWorkflowTruthReport(engine);
    expect(truth.workflowStatus).toBe("inconsistent");
    expect(truth.failureAnalysis).not.toBeNull();
    expect(truth.failureAnalysis!.primaryOrigin).toBe("downstream_system_state");
    expect(truth.failureAnalysis!.confidence).toBe("medium");
    expect(truth.failureAnalysis!.unknownReasonCodes).toEqual([]);
    expect(truth.failureAnalysis!.actionableFailure).toEqual({
      category: "ambiguous",
      severity: "high",
      recommendedAction: "manual_review",
      automationSafe: false,
    });
    expect(truth.failureAnalysis!.alternativeHypotheses).toHaveLength(2);
    expect(truth.steps[0]!.outcomeLabel).toBe(STEP_STATUS_TRUTH_LABELS.missing);
    expect(truth.steps[0]!.failureCategory).toBe("workflow_execution");
    const vt = formatVerificationTargetSummary(vr);
    expect(truth.steps[0]!.verifyTarget).toBe(vt === null ? null : vt);
  });

  it("run-level issue: runLevelIssues mirror reasons with categories", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "incomplete",
      runLevelReasons: [
        { code: "NO_STEPS_FOR_WORKFLOW", message: "No tool_observed events for this workflow id after filtering." },
      ],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: emptyCtx,
      steps: [],
    };
    const truth = buildWorkflowTruthReport(engine);
    expect(truth.failureAnalysis!.primaryOrigin).toBe("workflow_flow");
    expect(truth.failureAnalysis!.unknownReasonCodes).toEqual([]);
    expect(truth.failureAnalysis!.actionableFailure).toEqual({
      category: "control_flow_problem",
      severity: "medium",
      recommendedAction: "fix_event_ingest_and_steps",
      automationSafe: false,
    });
    expect(truth.runLevelIssues).toHaveLength(1);
    expect(truth.runLevelIssues[0]!.code).toBe("NO_STEPS_FOR_WORKFLOW");
    expect(truth.runLevelIssues[0]!.category).toBe(
      failureDiagnosticForRunLevelCode("NO_STEPS_FOR_WORKFLOW"),
    );
    expect(truth.executionPathFindings.some((f) => f.code === "RUN_LEVEL_INGEST_ISSUES")).toBe(true);
    expect(truth.executionPathSummary.startsWith("execution_path_concerns=")).toBe(true);
  });

  it("uncertain-only incomplete: dedicated trust summary", () => {
    const step: StepOutcome = {
      seq: 0,
      toolId: "t",
      intendedEffect: { narrative: "" },
      observedExecution: { paramsCanonical: "{}" },
      verificationRequest: {
        kind: "sql_row",
        table: "t",
        identityEq: [{ column: "id", value: "1" }],
        requiredFields: {},
      },
      status: "uncertain",
      reasons: [{ code: "ROW_NOT_OBSERVED_WITHIN_WINDOW", message: "window" }],
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
      failureDiagnostic: "observation_uncertainty",
    };
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "incomplete",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: emptyCtx,
      steps: [step],
    };
    const truth = buildWorkflowTruthReport(engine);
    expect(truth.failureAnalysis!.primaryOrigin).toBe("downstream_system_state");
    expect(truth.failureAnalysis!.unknownReasonCodes).toEqual([]);
    expect(truth.failureAnalysis!.actionableFailure).toEqual({
      category: "downstream_execution_failure",
      severity: "medium",
      recommendedAction: "improve_read_connectivity",
      automationSafe: false,
    });
    expect(truth.failureAnalysis!.alternativeHypotheses).toBeUndefined();
    expect(truth.trustSummary).toBe(TRUST_LINE_UNCERTAIN_WITHIN_WINDOW);
    expect(truth.steps[0]!.outcomeLabel).toBe("UNCERTAIN_NOT_OBSERVED_WITHIN_WINDOW");
    expect(truth.steps[0]!.failureCategory).toBe(
      step.failureDiagnostic ?? failureDiagnosticForStep(step),
    );
  });
});
