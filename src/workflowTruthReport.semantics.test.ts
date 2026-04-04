import { describe, expect, it } from "vitest";
import {
  failureDiagnosticForRunLevelCode,
  failureDiagnosticForStep,
  formatVerificationTargetSummary,
} from "./verificationDiagnostics.js";
import type { StepOutcome, WorkflowEngineResult } from "./types.js";
import { STEP_STATUS_TRUTH_LABELS, TRUST_LINE_UNCERTAIN_WITHIN_WINDOW, buildWorkflowTruthReport } from "./workflowTruthReport.js";
import { loadSchemaValidator } from "./schemaLoad.js";

const strongPolicy = {
  consistencyMode: "strong" as const,
  verificationWindowMs: 0,
  pollIntervalMs: 0,
};

function verifiedStep(seq: number, toolId: string): StepOutcome {
  return {
    seq,
    toolId,
    intendedEffect: "ok",
    verificationRequest: {
      kind: "sql_row",
      table: "t",
      keyColumn: "id",
      keyValue: "1",
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
      schemaVersion: 5,
      workflowId: "w",
      status: "complete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [verifiedStep(0, "t1")],
    };
    const truth = buildWorkflowTruthReport(engine);
    expect(truth.schemaVersion).toBe(1);
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
      keyColumn: "id",
      keyValue: "x",
      requiredFields: {},
    };
    const step: StepOutcome = {
      seq: 0,
      toolId: "t",
      intendedEffect: "",
      verificationRequest: vr,
      status: "missing",
      reasons: [{ code: "ROW_ABSENT", message: "m" }],
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
      failureDiagnostic: "workflow_execution",
    };
    const engine: WorkflowEngineResult = {
      schemaVersion: 5,
      workflowId: "w",
      status: "inconsistent",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [step],
    };
    const truth = buildWorkflowTruthReport(engine);
    expect(truth.workflowStatus).toBe("inconsistent");
    expect(truth.steps[0]!.outcomeLabel).toBe(STEP_STATUS_TRUTH_LABELS.missing);
    expect(truth.steps[0]!.failureCategory).toBe("workflow_execution");
    const vt = formatVerificationTargetSummary(vr);
    expect(truth.steps[0]!.verifyTarget).toBe(vt === null ? null : vt);
  });

  it("run-level issue: runLevelIssues mirror reasons with categories", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 5,
      workflowId: "w",
      status: "incomplete",
      runLevelCodes: ["NO_STEPS_FOR_WORKFLOW"],
      runLevelReasons: [
        { code: "NO_STEPS_FOR_WORKFLOW", message: "No tool_observed events for this workflow id after filtering." },
      ],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [],
    };
    const truth = buildWorkflowTruthReport(engine);
    expect(truth.runLevelIssues).toHaveLength(1);
    expect(truth.runLevelIssues[0]!.code).toBe("NO_STEPS_FOR_WORKFLOW");
    expect(truth.runLevelIssues[0]!.category).toBe(
      failureDiagnosticForRunLevelCode("NO_STEPS_FOR_WORKFLOW"),
    );
  });

  it("uncertain-only incomplete: dedicated trust summary", () => {
    const step: StepOutcome = {
      seq: 0,
      toolId: "t",
      intendedEffect: "",
      verificationRequest: {
        kind: "sql_row",
        table: "t",
        keyColumn: "id",
        keyValue: "1",
        requiredFields: {},
      },
      status: "uncertain",
      reasons: [{ code: "ROW_ABSENT", message: "window" }],
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
      failureDiagnostic: "observation_uncertainty",
    };
    const engine: WorkflowEngineResult = {
      schemaVersion: 5,
      workflowId: "w",
      status: "incomplete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [step],
    };
    const truth = buildWorkflowTruthReport(engine);
    expect(truth.trustSummary).toBe(TRUST_LINE_UNCERTAIN_WITHIN_WINDOW);
    expect(truth.steps[0]!.outcomeLabel).toBe("UNCERTAIN_NOT_OBSERVED_WITHIN_WINDOW");
    expect(truth.steps[0]!.failureCategory).toBe(
      step.failureDiagnostic ?? failureDiagnosticForStep(step),
    );
  });
});
