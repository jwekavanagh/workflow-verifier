import { describe, expect, it } from "vitest";
import {
  ACTIONABLE_FAILURE_CATEGORIES,
  ACTIONABLE_FAILURE_SEVERITIES,
  buildActionableCategoryRecurrence,
  deriveActionableCategory,
  deriveActionableFailureOperational,
  deriveActionableFailureWorkflow,
  deriveSeverityWorkflow,
  maxConsecutiveStreak,
  productionStepReasonCodeToActionableCategory,
} from "./actionableFailure.js";
import { buildFailureAnalysis } from "./failureAnalysis.js";
import { CLI_OPERATIONAL_CODES } from "./cliOperationalCodes.js";
import type { FailureAnalysisBase, WorkflowEngineResult } from "./types.js";
import { createEmptyVerificationRunContext } from "./verificationRunContext.js";

const strongPolicy = {
  consistencyMode: "strong" as const,
  verificationWindowMs: 0,
  pollIntervalMs: 0,
};

function baseEngine(partial: Partial<WorkflowEngineResult>): WorkflowEngineResult {
  return {
    schemaVersion: 7,
    workflowId: "w",
    status: "incomplete",
    runLevelReasons: [],
    verificationPolicy: strongPolicy,
    eventSequenceIntegrity: { kind: "normal" },
    verificationRunContext: createEmptyVerificationRunContext(),
    steps: [],
    ...partial,
  };
}

describe("deriveSeverityWorkflow", () => {
  it("inconsistent status yields high", () => {
    expect(deriveSeverityWorkflow(baseEngine({ status: "inconsistent" }))).toBe("high");
  });

  it("missing step yields high even when status incomplete", () => {
    expect(
      deriveSeverityWorkflow(
        baseEngine({
          status: "incomplete",
          steps: [
            {
              seq: 0,
              toolId: "t",
              intendedEffect: { narrative: "" },
              observedExecution: { paramsCanonical: "{}" },
              verificationRequest: null,
              status: "missing",
              reasons: [{ code: "ROW_ABSENT", message: "m" }],
              evidenceSummary: {},
              repeatObservationCount: 1,
              evaluatedObservationOrdinal: 1,
            },
          ],
        }),
      ),
    ).toBe("high");
  });

  it("uncertain-only incomplete yields medium", () => {
    expect(
      deriveSeverityWorkflow(
        baseEngine({
          status: "incomplete",
          steps: [
            {
              seq: 0,
              toolId: "t",
              intendedEffect: { narrative: "" },
              observedExecution: { paramsCanonical: "{}" },
              verificationRequest: {
                kind: "sql_row",
                table: "t",
                keyColumn: "id",
                keyValue: "1",
                requiredFields: {},
              },
              status: "uncertain",
              reasons: [{ code: "ROW_NOT_OBSERVED_WITHIN_WINDOW", message: "w" }],
              evidenceSummary: {},
              repeatObservationCount: 1,
              evaluatedObservationOrdinal: 1,
            },
          ],
        }),
      ),
    ).toBe("medium");
  });
});

describe("deriveActionableCategory", () => {
  it("unclassified when unknownReasonCodes non-empty", () => {
    const fa: FailureAnalysisBase = {
      summary: "s",
      primaryOrigin: "workflow_flow",
      confidence: "high",
      unknownReasonCodes: ["FUTURE_UNKNOWN_RL"],
      evidence: [{ scope: "run_level", codes: ["FUTURE_UNKNOWN_RL"] }],
    };
    expect(deriveActionableCategory(fa)).toBe("unclassified");
  });

  it("ambiguous when alternativeHypotheses present", () => {
    const fa: FailureAnalysisBase = {
      summary: "s",
      primaryOrigin: "downstream_system_state",
      confidence: "medium",
      unknownReasonCodes: [],
      evidence: [{ scope: "step", seq: 0, toolId: "t", codes: ["ROW_ABSENT"] }],
      alternativeHypotheses: [
        { primaryOrigin: "downstream_system_state", rationale: "a" },
        { primaryOrigin: "tool_use", rationale: "b" },
      ],
    };
    expect(deriveActionableCategory(fa)).toBe("ambiguous");
  });

  it("retrieval_failure from run_context RETRIEVAL_ERROR", () => {
    const fa: FailureAnalysisBase = {
      summary: "s",
      primaryOrigin: "retrieval",
      confidence: "high",
      unknownReasonCodes: [],
      evidence: [{ scope: "run_context", ingestIndex: 0, codes: ["RETRIEVAL_ERROR"] }],
    };
    expect(deriveActionableCategory(fa)).toBe("retrieval_failure");
  });

  it("decision_error from RETRY_OBSERVATIONS_DIVERGE step code", () => {
    const fa: FailureAnalysisBase = {
      summary: "s",
      primaryOrigin: "tool_use",
      confidence: "high",
      unknownReasonCodes: [],
      evidence: [{ scope: "step", seq: 0, toolId: "t", codes: ["RETRY_OBSERVATIONS_DIVERGE"] }],
    };
    expect(deriveActionableCategory(fa)).toBe("decision_error");
  });

  it("run-level NO_STEPS_FOR_WORKFLOW in step-shaped evidence still maps like run_level", () => {
    const fa: FailureAnalysisBase = {
      summary: "s",
      primaryOrigin: "workflow_flow",
      confidence: "high",
      unknownReasonCodes: [],
      evidence: [{ scope: "step", codes: ["NO_STEPS_FOR_WORKFLOW"] }],
    };
    expect(deriveActionableCategory(fa)).toBe("control_flow_problem");
  });
});

describe("productionStepReasonCodeToActionableCategory", () => {
  it("maps representative six-class codes", () => {
    expect(productionStepReasonCodeToActionableCategory("UNKNOWN_TOOL")).toBe("bad_input");
    expect(productionStepReasonCodeToActionableCategory("ROW_ABSENT")).toBe("state_inconsistency");
    expect(productionStepReasonCodeToActionableCategory("CONNECTOR_ERROR")).toBe("downstream_execution_failure");
    expect(productionStepReasonCodeToActionableCategory("MULTI_EFFECT_INCOMPLETE")).toBe("bad_input");
  });

  it("does not accept run-level-only codes (NO_STEPS_FOR_WORKFLOW, MALFORMED_EVENT_LINE)", () => {
    expect(() => productionStepReasonCodeToActionableCategory("NO_STEPS_FOR_WORKFLOW")).toThrow(
      /run-level-only code/,
    );
    expect(() => productionStepReasonCodeToActionableCategory("MALFORMED_EVENT_LINE")).toThrow(/run-level-only code/);
  });
});

describe("deriveActionableFailureOperational", () => {
  it("unknown code is unclassified medium", () => {
    expect(deriveActionableFailureOperational("NOT_A_REAL_OPERATIONAL_CODE")).toEqual({
      category: "unclassified",
      severity: "medium",
      recommendedAction: "manual_review",
      automationSafe: false,
    });
  });

  it("CLI_USAGE is bad_input low", () => {
    expect(deriveActionableFailureOperational(CLI_OPERATIONAL_CODES.CLI_USAGE)).toEqual({
      category: "bad_input",
      severity: "low",
      recommendedAction: "fix_cli_usage",
      automationSafe: false,
    });
  });
});

describe("maxConsecutiveStreak and buildActionableCategoryRecurrence", () => {
  it("computes longest consecutive runIndex block", () => {
    expect(maxConsecutiveStreak([0, 1, 3])).toBe(2);
    expect(maxConsecutiveStreak([2])).toBe(1);
    expect(maxConsecutiveStreak([0, 1, 2, 5, 6])).toBe(3);
  });

  it("buildActionableCategoryRecurrence sorts categories", () => {
    const rows = buildActionableCategoryRecurrence([
      { runIndex: 0, category: "zebra", severity: "low", recommendedAction: "none", automationSafe: true },
      { runIndex: 1, category: "apple", severity: "low", recommendedAction: "none", automationSafe: true },
    ]);
    expect(rows.map((r) => r.category)).toEqual(["apple", "zebra"]);
  });
});

describe("ACTIONABLE_FAILURE_CATEGORIES / SEVERITIES parity", () => {
  it("has eight categories and three severities", () => {
    expect(ACTIONABLE_FAILURE_CATEGORIES).toHaveLength(8);
    expect(ACTIONABLE_FAILURE_SEVERITIES).toHaveLength(3);
  });
});

describe("ambiguous category with high severity (workflow)", () => {
  it("ROW_ABSENT alternatives keep ambiguous category while severity follows engine", () => {
    const engine = baseEngine({
      status: "inconsistent",
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: { narrative: "" },
          observedExecution: { paramsCanonical: "{}" },
          verificationRequest: {
            kind: "sql_row",
            table: "t",
            keyColumn: "id",
            keyValue: "1",
            requiredFields: {},
          },
          status: "missing",
          reasons: [{ code: "ROW_ABSENT", message: "m" }],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    });
    const base = buildFailureAnalysis(engine);
    expect(base).not.toBeNull();
    const af = deriveActionableFailureWorkflow(engine, base!);
    expect(af.category).toBe("ambiguous");
    expect(af.severity).toBe("high");
    expect(af.recommendedAction).toBe("manual_review");
    expect(af.automationSafe).toBe(false);
  });
});
