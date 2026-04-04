import { describe, expect, it } from "vitest";
import {
  ACTION_INPUT_REASON_CODES,
  buildExecutionPathFindings,
  buildExecutionPathSummary,
  EXECUTION_PATH_FINDING_CODES,
  RECONCILER_STEP_REASON_CODES,
} from "./executionPathFindings.js";
import type {
  ExecutionPathFinding,
  StepOutcome,
  VerificationRunContext,
  WorkflowEngineResult,
} from "./types.js";
import { createEmptyVerificationRunContext, mergeVerificationRunContext } from "./verificationRunContext.js";

const strongPolicy = {
  consistencyMode: "strong" as const,
  verificationWindowMs: 0,
  pollIntervalMs: 0,
};

function baseEngine(
  overrides: Partial<WorkflowEngineResult> &
    Pick<WorkflowEngineResult, "workflowId" | "status" | "steps">,
): WorkflowEngineResult {
  return {
    schemaVersion: 6,
    runLevelCodes: [],
    runLevelReasons: [],
    verificationPolicy: strongPolicy,
    eventSequenceIntegrity: { kind: "normal" },
    verificationRunContext: createEmptyVerificationRunContext(),
    ...overrides,
  };
}

function verifiedStep(seq: number, toolId: string): StepOutcome {
  return {
    seq,
    toolId,
    intendedEffect: "x",
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

describe("buildExecutionPathFindings (product requirements)", () => {
  it("ACTION_INPUT_RESOLUTION_FAILED for STRING_SPEC_POINTER_MISSING", () => {
    const step: StepOutcome = {
      seq: 0,
      toolId: "bad.tool",
      intendedEffect: "",
      verificationRequest: null,
      status: "incomplete_verification",
      reasons: [{ code: "STRING_SPEC_POINTER_MISSING", message: "m" }],
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
      failureDiagnostic: "verification_setup",
    };
    const findings = buildExecutionPathFindings(
      baseEngine({
        workflowId: "w",
        status: "incomplete",
        steps: [step],
      }),
    );
    const f = findings.find((x) => x.code === "ACTION_INPUT_RESOLUTION_FAILED");
    expect(f).toBeDefined();
    expect(f!.concernCategory).toBe("action_inputs_invalid");
    expect(f!.evidence.codes).toContain("STRING_SPEC_POINTER_MISSING");
    expect(f!.evidence.seq).toBe(0);
    expect(f!.evidence.toolId).toBe("bad.tool");
  });

  it("ACTION_INPUT_RESOLUTION_FAILED for UNKNOWN_TOOL", () => {
    const step: StepOutcome = {
      seq: 0,
      toolId: "nope",
      intendedEffect: "Unknown tool: nope",
      verificationRequest: null,
      status: "incomplete_verification",
      reasons: [{ code: "UNKNOWN_TOOL", message: "u" }],
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
      failureDiagnostic: "verification_setup",
    };
    const findings = buildExecutionPathFindings(
      baseEngine({ workflowId: "w", status: "incomplete", steps: [step] }),
    );
    expect(findings.some((x) => x.code === "ACTION_INPUT_RESOLUTION_FAILED")).toBe(true);
  });

  it("RETRIEVAL_EMPTY vs RETRIEVAL_THIN_HITS are distinct context_quality codes", () => {
    const ctx: VerificationRunContext = mergeVerificationRunContext({
      maxWireSchemaVersion: 2,
      retrievalEvents: [
        { ingestIndex: 0, runEventId: "a", source: "s1", status: "empty" },
        { ingestIndex: 1, runEventId: "b", source: "s2", status: "ok", hitCount: 0 },
      ],
      firstToolObservedIngestIndex: 2,
      hasRunCompletedControl: true,
      lastRunEvent: { ingestIndex: 2, type: "tool_observed" },
    });
    const findings = buildExecutionPathFindings(
      baseEngine({
        workflowId: "w",
        status: "complete",
        steps: [verifiedStep(0, "t")],
        verificationRunContext: ctx,
      }),
    );
    const codes = findings.map((f) => f.code).sort();
    expect(codes).toContain("RETRIEVAL_EMPTY");
    expect(codes).toContain("RETRIEVAL_THIN_HITS");
    expect(findings.find((f) => f.code === "RETRIEVAL_EMPTY")!.concernCategory).toBe("context_quality");
    expect(findings.find((f) => f.code === "RETRIEVAL_THIN_HITS")!.concernCategory).toBe("context_quality");
  });

  it("NO_RETRIEVAL_EVENTS when v2, tools observed, zero retrieval digest rows", () => {
    const ctx: VerificationRunContext = mergeVerificationRunContext({
      maxWireSchemaVersion: 2,
      firstToolObservedIngestIndex: 0,
      hasRunCompletedControl: true,
      lastRunEvent: { ingestIndex: 0, type: "tool_observed" },
    });
    const findings = buildExecutionPathFindings(
      baseEngine({
        workflowId: "w",
        status: "complete",
        steps: [verifiedStep(0, "t")],
        verificationRunContext: ctx,
      }),
    );
    const f = findings.find((x) => x.code === "NO_RETRIEVAL_EVENTS");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("low");
  });

  it("TOOL_SKIPPED maps to tool_selection_execution", () => {
    const ctx: VerificationRunContext = mergeVerificationRunContext({
      maxWireSchemaVersion: 2,
      toolSkippedEvents: [{ ingestIndex: 0, toolId: "x", reason: "guard" }],
      firstToolObservedIngestIndex: 1,
      hasRunCompletedControl: true,
      lastRunEvent: { ingestIndex: 1, type: "tool_observed" },
    });
    const findings = buildExecutionPathFindings(
      baseEngine({
        workflowId: "w",
        status: "complete",
        steps: [verifiedStep(0, "t")],
        verificationRunContext: ctx,
      }),
    );
    const f = findings.find((x) => x.code === "TOOL_SKIPPED");
    expect(f?.concernCategory).toBe("tool_selection_execution");
  });

  it("MISSING_RUN_COMPLETED and LAST_EVENT_MODEL_ABNORMAL", () => {
    const ctx: VerificationRunContext = mergeVerificationRunContext({
      maxWireSchemaVersion: 2,
      firstToolObservedIngestIndex: 0,
      hasRunCompletedControl: false,
      lastRunEvent: { ingestIndex: 1, type: "model_turn", modelTurnStatus: "error" },
      modelTurnEvents: [{ ingestIndex: 1, runEventId: "m1", status: "error" }],
    });
    const findings = buildExecutionPathFindings(
      baseEngine({
        workflowId: "w",
        status: "complete",
        steps: [verifiedStep(0, "t")],
        verificationRunContext: ctx,
      }),
    );
    expect(findings.some((f) => f.code === "MISSING_RUN_COMPLETED")).toBe(true);
    expect(findings.some((f) => f.code === "LAST_EVENT_MODEL_ABNORMAL")).toBe(true);
    expect(findings.find((f) => f.code === "LAST_EVENT_MODEL_ABNORMAL")!.concernCategory).toBe(
      "workflow_completeness",
    );
  });

  it("trusted DB (complete) but path concerns: failureAnalysis null, findings non-empty", () => {
    const ctx: VerificationRunContext = mergeVerificationRunContext({
      maxWireSchemaVersion: 2,
      retrievalEvents: [{ ingestIndex: 0, runEventId: "r1", source: "kb", status: "empty" }],
      firstToolObservedIngestIndex: 1,
      hasRunCompletedControl: true,
      lastRunEvent: { ingestIndex: 1, type: "tool_observed" },
    });
    const engine = baseEngine({
      workflowId: "w",
      status: "complete",
      steps: [verifiedStep(0, "t")],
      verificationRunContext: ctx,
    });
    const findings = buildExecutionPathFindings(engine);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.code === "RETRIEVAL_EMPTY")).toBe(true);
  });

  it("inconsistent ROW_ABSENT: no path finding uses reconciler codes as top-level code", () => {
    const ctx: VerificationRunContext = mergeVerificationRunContext({
      maxWireSchemaVersion: 2,
      firstToolObservedIngestIndex: 0,
      hasRunCompletedControl: false,
      lastRunEvent: { ingestIndex: 0, type: "tool_observed" },
    });
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
      status: "missing",
      reasons: [{ code: "ROW_ABSENT", message: "m" }],
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
      failureDiagnostic: "workflow_execution",
    };
    const findings = buildExecutionPathFindings(
      baseEngine({
        workflowId: "w",
        status: "inconsistent",
        steps: [step],
        verificationRunContext: ctx,
      }),
    );
    for (const f of findings) {
      expect(RECONCILER_STEP_REASON_CODES.has(f.code)).toBe(false);
      expect(EXECUTION_PATH_FINDING_CODES.has(f.code)).toBe(true);
    }
  });

  it("root-cause matrix: primary concernCategory per signal", () => {
    const cases: Array<{
      label: string;
      engine: WorkflowEngineResult;
      expectCode: string;
      expectCategory: ExecutionPathFinding["concernCategory"];
    }> = [
      {
        label: "context",
        engine: baseEngine({
          workflowId: "w",
          status: "complete",
          steps: [verifiedStep(0, "t")],
          verificationRunContext: mergeVerificationRunContext({
            maxWireSchemaVersion: 2,
            retrievalEvents: [{ ingestIndex: 0, runEventId: "r", source: "s", status: "error" }],
            firstToolObservedIngestIndex: 1,
            hasRunCompletedControl: true,
            lastRunEvent: { ingestIndex: 1, type: "tool_observed" },
          }),
        }),
        expectCode: "RETRIEVAL_ERROR",
        expectCategory: "context_quality",
      },
      {
        label: "decision",
        engine: baseEngine({
          workflowId: "w",
          status: "complete",
          steps: [verifiedStep(0, "t")],
          verificationRunContext: mergeVerificationRunContext({
            maxWireSchemaVersion: 2,
            modelTurnEvents: [{ ingestIndex: 0, runEventId: "m", status: "incomplete" }],
            firstToolObservedIngestIndex: 1,
            hasRunCompletedControl: true,
            lastRunEvent: { ingestIndex: 1, type: "tool_observed" },
          }),
        }),
        expectCode: "MODEL_TURN_ABNORMAL",
        expectCategory: "decision_execution",
      },
      {
        label: "tool_selection",
        engine: baseEngine({
          workflowId: "w",
          status: "complete",
          steps: [verifiedStep(0, "t")],
          verificationRunContext: mergeVerificationRunContext({
            maxWireSchemaVersion: 2,
            toolSkippedEvents: [{ ingestIndex: 0, toolId: "z", reason: "r" }],
            firstToolObservedIngestIndex: 1,
            hasRunCompletedControl: true,
            lastRunEvent: { ingestIndex: 1, type: "tool_observed" },
          }),
        }),
        expectCode: "TOOL_SKIPPED",
        expectCategory: "tool_selection_execution",
      },
      {
        label: "action_inputs",
        engine: baseEngine({
          workflowId: "w",
          status: "incomplete",
          steps: [
            {
              seq: 0,
              toolId: "t",
              intendedEffect: "",
              verificationRequest: null,
              status: "incomplete_verification",
              reasons: [{ code: "TABLE_POINTER_INVALID", message: "m" }],
              evidenceSummary: {},
              repeatObservationCount: 1,
              evaluatedObservationOrdinal: 1,
              failureDiagnostic: "verification_setup",
            },
          ],
        }),
        expectCode: "ACTION_INPUT_RESOLUTION_FAILED",
        expectCategory: "action_inputs_invalid",
      },
      {
        label: "workflow_completeness_retries",
        engine: baseEngine({
          workflowId: "w",
          status: "complete",
          steps: [
            {
              ...verifiedStep(0, "t"),
              repeatObservationCount: 2,
            },
          ],
          verificationRunContext: mergeVerificationRunContext({
            maxWireSchemaVersion: 2,
            firstToolObservedIngestIndex: 0,
            hasRunCompletedControl: true,
            lastRunEvent: { ingestIndex: 0, type: "tool_observed" },
          }),
        }),
        expectCode: "LOGICAL_STEP_RETRIES",
        expectCategory: "workflow_completeness",
      },
    ];

    for (const c of cases) {
      const f = buildExecutionPathFindings(c.engine).find((x) => x.code === c.expectCode);
      expect(f, c.label).toBeDefined();
      expect(f!.concernCategory, c.label).toBe(c.expectCategory);
    }
  });

  it("v1 clear summary text when no findings", () => {
    const s = buildExecutionPathSummary([], 1);
    expect(s).toContain("schemaVersion 2");
  });

  it("v2 clear summary when no findings", () => {
    const s = buildExecutionPathSummary([], 2);
    expect(s).toBe("No execution-path concerns detected under current rules.");
  });
});

describe("ACTION_INPUT_REASON_CODES parity (resolveExpectation surface)", () => {
  it("includes every code the resolver can emit for failed resolution", () => {
    expect(ACTION_INPUT_REASON_CODES.has("DUPLICATE_EFFECT_ID")).toBe(true);
    expect(ACTION_INPUT_REASON_CODES.has("TABLE_SPEC_INVALID")).toBe(true);
    expect(ACTION_INPUT_REASON_CODES.size).toBeGreaterThanOrEqual(16);
  });
});
