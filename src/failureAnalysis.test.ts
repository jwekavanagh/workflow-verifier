import { describe, expect, it } from "vitest";
import { buildFailureAnalysis } from "./failureAnalysis.js";
import type { StepOutcome, VerificationRunContext, WorkflowEngineResult } from "./types.js";
import { createEmptyVerificationRunContext } from "./verificationRunContext.js";

const strongPolicy = {
  consistencyMode: "strong" as const,
  verificationWindowMs: 0,
  pollIntervalMs: 0,
};

function step(partial: Partial<StepOutcome> & Pick<StepOutcome, "seq" | "toolId" | "status">): StepOutcome {
  return {
    intendedEffect: "",
    verificationRequest: null,
    reasons: [],
    evidenceSummary: {},
    repeatObservationCount: 1,
    evaluatedObservationOrdinal: 1,
    ...partial,
  };
}

function engine(
  partial: Omit<Partial<WorkflowEngineResult>, "verificationRunContext"> & {
    verificationRunContext?: VerificationRunContext;
  },
): WorkflowEngineResult {
  const { verificationRunContext: ctx, ...rest } = partial;
  return {
    schemaVersion: 6,
    workflowId: "w",
    status: "incomplete",
    runLevelCodes: [],
    runLevelReasons: [],
    verificationPolicy: strongPolicy,
    eventSequenceIntegrity: { kind: "normal" },
    steps: [],
    verificationRunContext: ctx ?? createEmptyVerificationRunContext(),
    ...rest,
  };
}

describe("buildFailureAnalysis precedence", () => {
  it("P0: run-level NO_STEPS beats step failure", () => {
    const a = buildFailureAnalysis(
      engine({
        status: "inconsistent",
        runLevelReasons: [{ code: "NO_STEPS_FOR_WORKFLOW", message: "m" }],
        runLevelCodes: ["NO_STEPS_FOR_WORKFLOW"],
        steps: [
          step({
            seq: 0,
            toolId: "t",
            status: "missing",
            reasons: [{ code: "ROW_ABSENT", message: "x" }],
            failureDiagnostic: "workflow_execution",
          }),
        ],
      }),
    );
    expect(a?.primaryOrigin).toBe("workflow_flow");
    expect(a?.evidence[0]?.scope).toBe("run_level");
  });

  it("P1: retrieval error before failing tool → retrieval", () => {
    const ctx: VerificationRunContext = {
      maxWireSchemaVersion: 2,
      retrievalEvents: [
        { ingestIndex: 0, runEventId: "r1", source: "kb", status: "error" },
      ],
      controlEvents: [],
      modelTurnEvents: [],
      toolSkippedEvents: [],
      toolObservedIngestIndexBySeq: { "0": 2 },
      firstToolObservedIngestIndex: 2,
      hasRunCompletedControl: false,
      lastRunEvent: { ingestIndex: 2, type: "tool_observed" },
    };
    const a = buildFailureAnalysis(
      engine({
        status: "inconsistent",
        verificationRunContext: ctx,
        steps: [
          step({
            seq: 0,
            toolId: "t",
            status: "missing",
            verificationRequest: {
              kind: "sql_row",
              table: "t",
              keyColumn: "id",
              keyValue: "1",
              requiredFields: {},
            },
            reasons: [{ code: "ROW_ABSENT", message: "m" }],
            failureDiagnostic: "workflow_execution",
          }),
        ],
      }),
    );
    expect(a?.primaryOrigin).toBe("retrieval");
    expect(a?.confidence).toBe("high");
  });

  it("P1 wins over P2 when both upstream signals exist", () => {
    const ctx: VerificationRunContext = {
      maxWireSchemaVersion: 2,
      retrievalEvents: [{ ingestIndex: 0, runEventId: "r1", source: "s", status: "error" }],
      controlEvents: [],
      modelTurnEvents: [{ ingestIndex: 1, runEventId: "m1", status: "error" }],
      toolSkippedEvents: [],
      toolObservedIngestIndexBySeq: { "0": 3 },
      firstToolObservedIngestIndex: 3,
      hasRunCompletedControl: false,
      lastRunEvent: { ingestIndex: 3, type: "tool_observed" },
    };
    const a = buildFailureAnalysis(
      engine({
        status: "inconsistent",
        verificationRunContext: ctx,
        steps: [
          step({
            seq: 0,
            toolId: "t",
            status: "missing",
            verificationRequest: {
              kind: "sql_row",
              table: "t",
              keyColumn: "id",
              keyValue: "1",
              requiredFields: {},
            },
            reasons: [{ code: "ROW_ABSENT", message: "m" }],
            failureDiagnostic: "workflow_execution",
          }),
        ],
      }),
    );
    expect(a?.primaryOrigin).toBe("retrieval");
  });

  it("P2: model_turn error before failing tool → decision_making", () => {
    const ctx: VerificationRunContext = {
      maxWireSchemaVersion: 2,
      retrievalEvents: [],
      controlEvents: [],
      modelTurnEvents: [{ ingestIndex: 0, runEventId: "m1", status: "error" }],
      toolSkippedEvents: [],
      toolObservedIngestIndexBySeq: { "0": 1 },
      firstToolObservedIngestIndex: 1,
      hasRunCompletedControl: false,
      lastRunEvent: { ingestIndex: 1, type: "tool_observed" },
    };
    const a = buildFailureAnalysis(
      engine({
        status: "inconsistent",
        verificationRunContext: ctx,
        steps: [
          step({
            seq: 0,
            toolId: "t",
            status: "missing",
            verificationRequest: {
              kind: "sql_row",
              table: "t",
              keyColumn: "id",
              keyValue: "1",
              requiredFields: {},
            },
            reasons: [{ code: "ROW_ABSENT", message: "m" }],
            failureDiagnostic: "workflow_execution",
          }),
        ],
      }),
    );
    expect(a?.primaryOrigin).toBe("decision_making");
  });

  it("ROW_ABSENT carries alternatives", () => {
    const a = buildFailureAnalysis(
      engine({
        status: "inconsistent",
        steps: [
          step({
            seq: 0,
            toolId: "t",
            status: "missing",
            verificationRequest: {
              kind: "sql_row",
              table: "t",
              keyColumn: "id",
              keyValue: "1",
              requiredFields: {},
            },
            reasons: [{ code: "ROW_ABSENT", message: "m" }],
            failureDiagnostic: "workflow_execution",
          }),
        ],
      }),
    );
    expect(a?.primaryOrigin).toBe("downstream_system_state");
    expect(a?.alternativeHypotheses).toHaveLength(2);
  });

  it("complete → null", () => {
    expect(
      buildFailureAnalysis(
        engine({
          status: "complete",
          steps: [
            step({
              seq: 0,
              toolId: "t",
              status: "verified",
              verificationRequest: {
                kind: "sql_row",
                table: "t",
                keyColumn: "id",
                keyValue: "1",
                requiredFields: {},
              },
            }),
          ],
        }),
      ),
    ).toBeNull();
  });
});
