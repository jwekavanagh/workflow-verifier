import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildFailureExplanation, FailureExplanationInvariantError } from "./failureExplanation.js";
import {
  buildWorkflowTruthReport,
  formatWorkflowTruthReportStruct,
} from "./workflowTruthReport.js";
import { workflowEngineResultFromEmitted } from "./workflowResultNormalize.js";
import type {
  StepOutcome,
  VerificationPolicy,
  WorkflowEngineResult,
  WorkflowTruthReport,
} from "./types.js";
import { createEmptyVerificationRunContext } from "./verificationRunContext.js";
import { loadSchemaValidator } from "./schemaLoad.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function missingStep(seq: number, toolId: string): StepOutcome {
  return {
    seq,
    toolId,
    intendedEffect: { narrative: "n" },
    observedExecution: { paramsCanonical: "{}" },
    verificationRequest: {
      kind: "sql_row",
      table: "contacts",
      identityEq: [{ column: "id", value: "1" }],
      requiredFields: {},
    },
    status: "missing",
    reasons: [{ code: "ROW_ABSENT", message: "no row" }],
    evidenceSummary: {},
    repeatObservationCount: 1,
    evaluatedObservationOrdinal: 1,
    failureDiagnostic: "workflow_execution",
  };
}

function ctxWithToolAt2(): WorkflowEngineResult["verificationRunContext"] {
  return {
    maxWireSchemaVersion: 2,
    retrievalEvents: [],
    controlEvents: [],
    modelTurnEvents: [],
    toolSkippedEvents: [],
    toolObservedIngestIndexBySeq: { "0": 2 },
    firstToolObservedIngestIndex: 2,
    hasRunCompletedControl: false,
    lastRunEvent: { ingestIndex: 2, type: "tool_observed" },
  };
}

describe("failureExplanation goldens (real buildFailureAnalysis)", () => {
  it("G1: complete → null explanation; stderr omits failure_explanation", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "complete",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [verifiedStep(0, "t1")],
    };
    const truth = buildWorkflowTruthReport(engine);
    expect(truth.failureExplanation).toBeNull();
    const stderr = formatWorkflowTruthReportStruct(truth);
    expect(stderr).not.toContain("failure_explanation:");
  });

  it("G2: VALUE_MISMATCH fixture deep-equal failureExplanation + stderr lines", () => {
    const raw = readFileSync(path.join(root, "test/fixtures/wf_inconsistent_result.json"), "utf8");
    const emitted = JSON.parse(raw) as Parameters<typeof workflowEngineResultFromEmitted>[0];
    const goldenFe = emitted.workflowTruthReport.failureExplanation;
    expect(goldenFe).not.toBeNull();
    const engine = workflowEngineResultFromEmitted(emitted);
    const truth = buildWorkflowTruthReport(engine);
    expect(truth.failureExplanation).toEqual(goldenFe);
    const lines = formatWorkflowTruthReportStruct(truth).split("\n");
    const idx = lines.indexOf("failure_explanation:");
    expect(idx).toBeGreaterThan(-1);
    expect(lines[idx + 1]).toBe(`expected: ${goldenFe!.expected}`);
    expect(lines[idx + 2]).toBe(`observed: ${goldenFe!.observed}`);
    expect(lines[idx + 3]).toBe(`divergence: ${goldenFe!.divergence}`);
  });

  it("G3: RUN_LEVEL (non–NO_STEPS) templates and facts", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "wf_rl",
      status: "incomplete",
      runLevelReasons: [{ code: "MALFORMED_EVENT_LINE", message: "  bad line  " }],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [],
    };
    const truth = buildWorkflowTruthReport(engine);
    const fe = truth.failureExplanation!;
    expect(fe.schemaVersion).toBe(1);
    expect(fe.expected).toContain("workflowId=wf_rl");
    expect(fe.expected).toContain("policy [consistencyMode=strong; verificationWindowMs=0; pollIntervalMs=0]");
    expect(fe.observed).toContain("code=MALFORMED_EVENT_LINE");
    expect(fe.observed).toContain("detail=bad line");
    expect(fe.divergence).toContain("code=MALFORMED_EVENT_LINE");
    expect(fe.knownFacts.some((k) => k.id === "primary_scope" && k.value === "run_level")).toBe(true);
    expect(fe.unknowns).toEqual([]);
  });

  it("G4: EVENT_SEQUENCE irregular branch", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "wf_es",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: {
        kind: "irregular",
        reasons: [{ code: "CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ", message: "out of order" }],
      },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [verifiedStep(0, "t")],
    };
    const fe = buildWorkflowTruthReport(engine).failureExplanation!;
    expect(fe.expected).toContain("monotonic, well-formed event capture");
    expect(fe.observed).toContain("CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ");
    expect(fe.observed).toContain("detail=out of order");
    expect(fe.divergence).toContain("event_sequence");
    expect(fe.knownFacts.some((k) => k.id === "primary_scope" && k.value === "event_sequence")).toBe(true);
  });

  it("G5: RUN_CONTEXT RETRIEVAL_ERROR detail", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "wf_p1",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: {
        ...ctxWithToolAt2(),
        retrievalEvents: [
          { ingestIndex: 0, runEventId: "r0", source: "wiki", status: "error" },
        ],
      },
      steps: [missingStep(0, "t")],
    };
    const fe = buildWorkflowTruthReport(engine).failureExplanation!;
    expect(fe.observed).toContain("code=RETRIEVAL_ERROR");
    expect(fe.observed).toContain("source=wiki status=error");
    expect(fe.knownFacts.some((k) => k.id === "primary_ingest_index" && k.value === "0")).toBe(true);
  });

  it.each([
    {
      name: "MODEL_TURN_error",
      patch: {
        modelTurnEvents: [{ ingestIndex: 1, runEventId: "m1", status: "error" as const }],
      },
      sub: "status=error",
    },
    {
      name: "MODEL_TURN_aborted",
      patch: {
        modelTurnEvents: [{ ingestIndex: 1, runEventId: "m2", status: "aborted" as const }],
      },
      sub: "status=aborted",
    },
    {
      name: "MODEL_TURN_incomplete",
      patch: {
        modelTurnEvents: [{ ingestIndex: 1, runEventId: "m3", status: "incomplete" as const }],
      },
      sub: "status=incomplete",
    },
    {
      name: "CONTROL_INTERRUPT",
      patch: {
        controlEvents: [{ ingestIndex: 1, runEventId: "c1", controlKind: "interrupt" as const }],
      },
      sub: "controlKind=interrupt",
    },
    {
      name: "CONTROL_BRANCH_SKIPPED",
      patch: {
        controlEvents: [
          {
            ingestIndex: 1,
            runEventId: "c2",
            controlKind: "branch" as const,
            decision: "skipped" as const,
          },
        ],
      },
      sub: "controlKind=branch decision=skipped",
    },
    {
      name: "CONTROL_GATE_SKIPPED",
      patch: {
        controlEvents: [
          {
            ingestIndex: 1,
            runEventId: "c3",
            controlKind: "gate" as const,
            decision: "skipped" as const,
          },
        ],
      },
      sub: "controlKind=gate decision=skipped",
    },
    {
      name: "TOOL_SKIPPED",
      patch: {
        toolSkippedEvents: [{ ingestIndex: 1, toolId: "skipped.tool", reason: "policy" }],
      },
      sub: "toolId=skipped.tool",
    },
  ])("G6: RUN_CONTEXT $name", ({ patch, sub }: { name: string; patch: Partial<WorkflowEngineResult["verificationRunContext"]>; sub: string }) => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "wf_ctx",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: {
        ...ctxWithToolAt2(),
        ...patch,
      },
      steps: [missingStep(0, "t")],
    };
    const truth = buildWorkflowTruthReport(engine);
    const fe = truth.failureExplanation!;
    expect(fe.observed).toContain(sub);
    expect(fe.knownFacts.some((k) => k.id === "primary_ingest_index" && k.value === "1")).toBe(true);
    expect(fe).toEqual(buildWorkflowTruthReport(engine).failureExplanation);
  });

  it("G7: multi-effect partial rollup uses lexicographically first failing effect id", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "wf_me",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [
        {
          seq: 0,
          toolId: "demo.multi",
          intendedEffect: { narrative: "x" },
          observedExecution: { paramsCanonical: "{}" },
          verificationRequest: {
            kind: "sql_effects",
            effects: [
              {
                id: "z",
                kind: "sql_row",
                table: "contacts",
                identityEq: [{ column: "id", value: "cz" }],
                requiredFields: { name: "Z" },
              },
              {
                id: "a",
                kind: "sql_row",
                table: "contacts",
                identityEq: [{ column: "id", value: "ca" }],
                requiredFields: { name: "A" },
              },
            ],
          },
          status: "partially_verified",
          reasons: [
            {
              code: "MULTI_EFFECT_PARTIAL",
              message: "Verified 1 of 2 effects; not verified: a. Per effect: a (VALUE_MISMATCH)",
            },
          ],
          evidenceSummary: {
            effectCount: 2,
            effects: [
              {
                id: "z",
                status: "verified",
                reasons: [],
                evidenceSummary: { rowCount: 1 },
              },
              {
                id: "a",
                status: "inconsistent",
                reasons: [
                  {
                    code: "VALUE_MISMATCH",
                    message: 'FROM_EFFECT_A detail phrase',
                  },
                ],
                evidenceSummary: { rowCount: 1, field: "name" },
              },
            ],
          },
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
          failureDiagnostic: "workflow_execution",
        },
      ],
    };
    const fe = buildWorkflowTruthReport(engine).failureExplanation!;
    expect(fe.observed).toContain("code=VALUE_MISMATCH");
    expect(fe.observed).toContain("FROM_EFFECT_A detail phrase");
    expect(fe.knownFacts.some((k) => k.id === "primary_effect_id" && k.value === "a")).toBe(true);
  });

  it("G8: NO_STEPS_FOR_WORKFLOW uses no-steps sub-templates", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "wf_empty",
      status: "incomplete",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [],
    };
    const fe = buildWorkflowTruthReport(engine).failureExplanation!;
    expect(fe.expected).toContain("workflowId=wf_empty");
    expect(fe.expected).toContain("no run-level ingest or planning failures");
    expect(fe.observed).toContain("No tool_observed steps were produced");
    expect(fe.divergence).toContain("no steps to verify against the database");
  });

  it("G9: high confidence run-level → unknowns []", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "wf_hi",
      status: "incomplete",
      runLevelReasons: [{ code: "MALFORMED_EVENT_LINE", message: "one code only" }],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [],
    };
    const fe = buildWorkflowTruthReport(engine).failureExplanation!;
    expect(fe.unknowns).toEqual([]);
  });

  it("G10: medium confidence band in unknowns", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "wf_med",
      status: "incomplete",
      runLevelReasons: [
        { code: "MALFORMED_EVENT_LINE", message: "a" },
        { code: "TEST_BLOCKING_CODE", message: "b" },
      ],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [],
    };
    const fe = buildWorkflowTruthReport(engine).failureExplanation!;
    expect(fe.unknowns).toEqual([{ id: "classification_confidence_band", value: "medium" }]);
  });

  it("G11: low confidence band in unknowns", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "wf_lo",
      status: "incomplete",
      runLevelReasons: [
        { code: "MALFORMED_EVENT_LINE", message: "a" },
        { code: "ZZZ_UNKNOWN_RL_CODE", message: "b" },
      ],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [],
    };
    const fe = buildWorkflowTruthReport(engine).failureExplanation!;
    expect(fe.unknowns.some((u) => u.id === "classification_confidence_band" && u.value === "low")).toBe(
      true,
    );
    expect(fe.unknowns.some((u) => u.id === "unknown_reason_code")).toBe(true);
  });

  it("G13: competing_hypothesis order matches failureAnalysis.alternativeHypotheses", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "wf_alt",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: {
        maxWireSchemaVersion: 2,
        retrievalEvents: [],
        modelTurnEvents: [],
        toolSkippedEvents: [],
        controlEvents: [
          {
            ingestIndex: 0,
            runEventId: "c1",
            controlKind: "branch",
            decision: "skipped",
          },
        ],
        toolObservedIngestIndexBySeq: { "0": 2 },
        firstToolObservedIngestIndex: 2,
        hasRunCompletedControl: false,
        lastRunEvent: { ingestIndex: 2, type: "tool_observed" },
      },
      steps: [missingStep(0, "t")],
    };
    const truth = buildWorkflowTruthReport(engine);
    const alts = truth.failureAnalysis!.alternativeHypotheses!;
    const comp = truth.failureExplanation!.unknowns.filter((u) => u.id === "competing_hypothesis");
    expect(comp).toHaveLength(alts.length);
    for (let i = 0; i < alts.length; i++) {
      expect(comp[i]!.value).toContain(`origin=${alts[i]!.primaryOrigin}`);
    }
  });

  it("I3: invalid verificationPolicy throws EXPLANATION_VERIFICATION_POLICY_INVALID", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "bogus",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      } as unknown as VerificationPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [missingStep(0, "t")],
    };
    expect(() => buildWorkflowTruthReport(engine)).toThrow(FailureExplanationInvariantError);
    try {
      buildWorkflowTruthReport(engine);
    } catch (e) {
      expect((e as FailureExplanationInvariantError).code).toBe("EXPLANATION_VERIFICATION_POLICY_INVALID");
    }
  });

  it("I5: buildFailureExplanation throws when truth omits driver step row", () => {
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [missingStep(0, "t")],
    };
    const full = buildWorkflowTruthReport(engine);
    const partial: Omit<WorkflowTruthReport, "schemaVersion" | "failureExplanation"> = {
      workflowId: full.workflowId,
      workflowStatus: full.workflowStatus,
      trustSummary: full.trustSummary,
      runLevelIssues: full.runLevelIssues,
      eventSequence: full.eventSequence,
      steps: [],
      failureAnalysis: full.failureAnalysis,
      executionPathFindings: full.executionPathFindings,
      executionPathSummary: full.executionPathSummary,
    };
    expect(() => buildFailureExplanation(engine, partial)).toThrow(FailureExplanationInvariantError);
    try {
      buildFailureExplanation(engine, partial);
    } catch (e) {
      expect((e as FailureExplanationInvariantError).code).toBe("EXPLANATION_STEP_TRUTH_MISMATCH");
    }
  });

  it("schema: complete + non-null failureExplanation fails AJV", () => {
    const v = loadSchemaValidator("workflow-truth-report");
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "complete",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [verifiedStep(0, "t")],
    };
    const truth = buildWorkflowTruthReport(engine);
    const nonNull = {
      ...truth,
      failureExplanation: {
        schemaVersion: 1,
        expected: "e",
        observed: "o",
        divergence: "d",
        knownFacts: [{ id: "trust_summary", value: "t" }],
        unknowns: [],
      },
    };
    expect(v(nonNull)).toBe(false);
  });

  it("schema: inconsistent + null failureExplanation fails AJV", () => {
    const v = loadSchemaValidator("workflow-truth-report");
    const engine: WorkflowEngineResult = {
      schemaVersion: 8,
      workflowId: "w",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: strongPolicy,
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [missingStep(0, "t")],
    };
    const truth = buildWorkflowTruthReport(engine);
    const bad = { ...truth, failureExplanation: null };
    expect(v(bad)).toBe(false);
  });
});
