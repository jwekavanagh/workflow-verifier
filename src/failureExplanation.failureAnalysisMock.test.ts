/**
 * Isolated file: `vi.mock("./failureAnalysis.js")` must not run with tests that need the real analyzer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FailureAnalysisBase } from "./types.js";
import type { WorkflowEngineResult } from "./types.js";
import { FailureExplanationInvariantError } from "./failureExplanation.js";
import { buildWorkflowTruthReport } from "./workflowTruthReport.js";
import { createEmptyVerificationRunContext } from "./verificationRunContext.js";
vi.mock("./failureAnalysis.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./failureAnalysis.js")>();
  return { ...orig, buildFailureAnalysis: vi.fn() };
});

import { buildFailureAnalysis } from "./failureAnalysis.js";

const strongPolicy = {
  consistencyMode: "strong" as const,
  verificationWindowMs: 0,
  pollIntervalMs: 0,
};

function missingStep(): WorkflowEngineResult["steps"][number] {
  return {
    seq: 0,
    toolId: "t",
    intendedEffect: { narrative: "n" },
    observedExecution: { paramsCanonical: "{}" },
    verificationRequest: {
      kind: "sql_row",
      table: "contacts",
      identityEq: [{ column: "id", value: "1" }],
      requiredFields: {},
    },
    status: "missing",
    reasons: [{ code: "ROW_ABSENT", message: "absent" }],
    evidenceSummary: {},
    repeatObservationCount: 1,
    evaluatedObservationOrdinal: 1,
    failureDiagnostic: "workflow_execution",
  };
}

const stepPrimaryFa: FailureAnalysisBase = {
  summary: "Primary failure at seq 0 tool t (code ROW_ABSENT); origin: downstream_system_state.",
  primaryOrigin: "downstream_system_state",
  confidence: "medium",
  unknownReasonCodes: [],
  evidence: [{ scope: "step", seq: 0, toolId: "t", codes: ["ROW_ABSENT"] }],
};

beforeEach(() => {
  vi.mocked(buildFailureAnalysis).mockReset();
});

describe("failure explanation invariants (mocked buildFailureAnalysis)", () => {
  it("I1: primary evidence scope effect throws EXPLANATION_PRIMARY_EVIDENCE_SCOPE_EFFECT", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [missingStep()],
    };
    vi.mocked(buildFailureAnalysis)
      .mockImplementationOnce(() => stepPrimaryFa)
      .mockImplementationOnce(() => ({
        ...stepPrimaryFa,
        evidence: [{ scope: "effect", effectId: "e1", seq: 0, codes: ["VALUE_MISMATCH"] }],
      }));
    try {
      buildWorkflowTruthReport(engine);
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(FailureExplanationInvariantError);
      expect((e as FailureExplanationInvariantError).code).toBe(
        "EXPLANATION_PRIMARY_EVIDENCE_SCOPE_EFFECT",
      );
    }
  });

  it("I2: empty primary codes throws EXPLANATION_EVIDENCE_CODES_EMPTY", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [missingStep()],
    };
    vi.mocked(buildFailureAnalysis)
      .mockImplementationOnce(() => stepPrimaryFa)
      .mockImplementationOnce(() => ({
        ...stepPrimaryFa,
        evidence: [{ scope: "step", seq: 0, toolId: "t", codes: [] }],
      }));
    try {
      buildWorkflowTruthReport(engine);
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(FailureExplanationInvariantError);
      expect((e as FailureExplanationInvariantError).code).toBe("EXPLANATION_EVIDENCE_CODES_EMPTY");
    }
  });

  it("I4: run_context without ingestIndex throws EXPLANATION_RUN_CONTEXT_INDEX_MISSING", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [missingStep()],
    };
    vi.mocked(buildFailureAnalysis)
      .mockImplementationOnce(() => stepPrimaryFa)
      .mockImplementationOnce(() => ({
        ...stepPrimaryFa,
        primaryOrigin: "retrieval",
        evidence: [{ scope: "run_context", codes: ["RETRIEVAL_ERROR"] }],
      }));
    try {
      buildWorkflowTruthReport(engine);
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(FailureExplanationInvariantError);
      expect((e as FailureExplanationInvariantError).code).toBe(
        "EXPLANATION_RUN_CONTEXT_INDEX_MISSING",
      );
    }
  });

  it("G12: unknown_reason_code rows sort by value UTF-16 (AA before ZZ)", () => {
    const fa: FailureAnalysisBase = {
      summary: "Run-level ingest or planning issue (MALFORMED_EVENT_LINE, ZZ, AA); origin: workflow_flow.",
      primaryOrigin: "workflow_flow",
      confidence: "low",
      unknownReasonCodes: ["ZZ", "AA"],
      evidence: [{ scope: "run_level", codes: ["MALFORMED_EVENT_LINE", "ZZ", "AA"] }],
    };
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "incomplete",
      runLevelReasons: [
        { code: "MALFORMED_EVENT_LINE", message: "m1" },
        { code: "ZZ", message: "m2" },
        { code: "AA", message: "m3" },
      ],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [],
    };
    vi.mocked(buildFailureAnalysis).mockImplementation(() => fa);
    const truth = buildWorkflowTruthReport(engine);
    const unknownReasonRows = truth.failureExplanation!.unknowns.filter((u) => u.id === "unknown_reason_code");
    expect(unknownReasonRows).toHaveLength(2);
    expect(unknownReasonRows[0]!.value.localeCompare(unknownReasonRows[1]!.value)).toBeLessThan(0);
    expect(unknownReasonRows[0]!.value).toContain("code=AA|");
    expect(unknownReasonRows[1]!.value).toContain("code=ZZ|");
  });

  it("G14: run_context digest gap yields run_context_record_missing=true in observed", () => {
    const fa: FailureAnalysisBase = {
      summary: "A retrieval step failed before the failing tool observation (src); origin: retrieval.",
      primaryOrigin: "retrieval",
      confidence: "high",
      unknownReasonCodes: [],
      evidence: [
        {
          scope: "run_context",
          ingestIndex: 9,
          source: "src",
          runEventId: "r1",
          codes: ["RETRIEVAL_ERROR"],
        },
      ],
    };
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: {
        maxWireSchemaVersion: 2,
        retrievalEvents: [],
        controlEvents: [],
        modelTurnEvents: [],
        toolSkippedEvents: [],
        toolObservedIngestIndexBySeq: { "0": 2 },
        firstToolObservedIngestIndex: 2,
        hasRunCompletedControl: false,
        lastRunEvent: { ingestIndex: 2, type: "tool_observed" },
      },
      steps: [missingStep()],
    };
    vi.mocked(buildFailureAnalysis).mockImplementation(() => fa);
    const truth = buildWorkflowTruthReport(engine);
    expect(truth.failureExplanation!.observed).toContain("run_context_record_missing=true");
    expect(truth.failureExplanation!.observed).toContain("code=RETRIEVAL_ERROR");
  });
});
