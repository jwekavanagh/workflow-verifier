import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildRunComparisonReport } from "./runComparison.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import type { StepOutcome, WorkflowEngineResult, WorkflowResult } from "./types.js";
import { createEmptyVerificationRunContext } from "./verificationRunContext.js";
import { finalizeEmittedWorkflowResult } from "./workflowTruthReport.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const emptyCtx = createEmptyVerificationRunContext();

describe("JSON Schemas (SSOT)", () => {
  it("validates plan-validation front matter document", () => {
    const v = loadSchemaValidator("plan-validation-frontmatter");
    const doc = {
      name: "ignored",
      planValidation: {
        schemaVersion: 1,
        rules: [
          {
            id: "r1",
            kind: "forbidMatchingRows",
            pattern: "secret.env",
          },
          {
            id: "r2",
            kind: "requireRenameFromTo",
            fromPattern: "a",
            toPattern: "b",
            includeCopy: false,
          },
        ],
      },
    };
    expect(v(doc)).toBe(true);
  });

  it("validates tool_observed event lines", () => {
    const v = loadSchemaValidator("event");
    const line = JSON.parse(
      readFileSync(path.join(root, "examples", "events.ndjson"), "utf8").split("\n")[0]!,
    );
    expect(v(line)).toBe(true);
  });

  it("validates v2 model_turn run event", () => {
    const v = loadSchemaValidator("event");
    const line = {
      schemaVersion: 2,
      workflowId: "w",
      runEventId: "m1",
      type: "model_turn",
      status: "completed",
    };
    expect(v(line)).toBe(true);
  });

  it("validates ExecutionTraceView minimal shape", () => {
    const v = loadSchemaValidator("execution-trace-view");
    const view = {
      schemaVersion: 1,
      workflowId: "w",
      runCompletion: "unknown_or_interrupted",
      malformedEventLineCount: 0,
      nodes: [],
      backwardPaths: [],
    };
    expect(v(view)).toBe(true);
  });

  it("rejects event with embedded expectation", () => {
    const v = loadSchemaValidator("event");
    const bad = {
      schemaVersion: 1,
      workflowId: "w",
      seq: 0,
      type: "tool_observed",
      toolId: "t",
      params: {},
      expectation: {},
    };
    expect(v(bad)).toBe(false);
  });

  it("validates tools registry", () => {
    const v = loadSchemaValidator("tools-registry");
    const reg = JSON.parse(readFileSync(path.join(root, "examples", "tools.json"), "utf8"));
    expect(v(reg)).toBe(true);
  });

  it("validates workflow result shape from golden pipeline output", () => {
    const v = loadSchemaValidator("workflow-result");
    const engine: WorkflowEngineResult = {
      schemaVersion: 7,
      workflowId: "wf_complete",
      status: "complete",
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: emptyCtx,
      steps: [
        {
          seq: 0,
          toolId: "crm.upsert_contact",
          intendedEffect: { narrative: "x" },
          observedExecution: { paramsCanonical: "{}" },
          verificationRequest: {
            kind: "sql_row",
            table: "contacts",
            keyColumn: "id",
            keyValue: "c_ok",
            requiredFields: { name: "Alice" },
          },
          status: "verified",
          reasons: [],
          evidenceSummary: { rowCount: 1 },
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    expect(v(finalizeEmittedWorkflowResult(engine))).toBe(true);
  });

  it("validates multi-effect workflow result (sql_effects + evidenceSummary.effects)", () => {
    const v = loadSchemaValidator("workflow-result");
    const engine: WorkflowEngineResult = {
      schemaVersion: 7,
      workflowId: "wf_multi",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: emptyCtx,
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
                id: "a",
                kind: "sql_row",
                table: "contacts",
                keyColumn: "id",
                keyValue: "c1",
                requiredFields: { name: "A" },
              },
              {
                id: "b",
                kind: "sql_row",
                table: "contacts",
                keyColumn: "id",
                keyValue: "c2",
                requiredFields: { name: "B" },
              },
            ],
          },
          status: "partially_verified",
          reasons: [
            {
              code: "MULTI_EFFECT_PARTIAL",
              message: "Verified 1 of 2 effects; not verified: b. Per effect: b (ROW_ABSENT)",
            },
          ],
          evidenceSummary: {
            effectCount: 2,
            effects: [
              {
                id: "a",
                status: "verified",
                reasons: [],
                evidenceSummary: { rowCount: 1 },
              },
              {
                id: "b",
                status: "inconsistent",
                reasons: [
                  {
                    code: "VALUE_MISMATCH",
                    message: 'Expected "B" but found "X" for field name (table=contacts id=c2)',
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
    expect(v(finalizeEmittedWorkflowResult(engine))).toBe(true);
  });

  it("rejects single-effect step evidenceSummary with effectCount", () => {
    const v = loadSchemaValidator("workflow-engine-result");
    const bad = {
      schemaVersion: 7,
      workflowId: "w",
      status: "complete",
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: emptyCtx,
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: { narrative: "" },
          observedExecution: { paramsCanonical: "{}" },
          verificationRequest: {
            kind: "sql_row",
            table: "contacts",
            keyColumn: "id",
            keyValue: "1",
            requiredFields: {},
          },
          status: "verified",
          reasons: [],
          evidenceSummary: { rowCount: 1, effectCount: 2 },
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    expect(v(bad)).toBe(false);
  });

  it("validates RunComparisonReport from buildRunComparisonReport", () => {
    const v = loadSchemaValidator("run-comparison-report");
    const step = (seq: number, kv: string, ok: boolean): StepOutcome => ({
      seq,
      toolId: "t",
      intendedEffect: { narrative: "" },
      observedExecution: { paramsCanonical: "{}" },
      verificationRequest: {
        kind: "sql_row",
        table: "contacts",
        keyColumn: "id",
        keyValue: kv,
        requiredFields: {},
      },
      status: ok ? "verified" : "missing",
      reasons: ok ? [] : [{ code: "ROW_ABSENT", message: "m" }],
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
      ...(ok ? {} : { failureDiagnostic: "workflow_execution" as const }),
    });
    const engine0: WorkflowEngineResult = {
      schemaVersion: 7,
      workflowId: "w",
      status: "complete",
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: emptyCtx,
      steps: [step(0, "a", true)],
    };
    const r0: WorkflowResult = finalizeEmittedWorkflowResult(engine0);
    const r1: WorkflowResult = finalizeEmittedWorkflowResult({
      ...engine0,
      steps: [step(0, "a", true)],
    });
    const report = buildRunComparisonReport([r0, r1], ["x", "y"]);
    expect(v(report)).toBe(true);
  });

  it("validates workflow-truth-report subtree from finalized engine", () => {
    const vTruth = loadSchemaValidator("workflow-truth-report");
    const vResult = loadSchemaValidator("workflow-result");
    const engine: WorkflowEngineResult = {
      schemaVersion: 7,
      workflowId: "wf_complete",
      status: "complete",
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: emptyCtx,
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: { narrative: "x" },
          observedExecution: { paramsCanonical: "{}" },
          verificationRequest: {
            kind: "sql_row",
            table: "contacts",
            keyColumn: "id",
            keyValue: "1",
            requiredFields: {},
          },
          status: "verified",
          reasons: [],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    const emitted = finalizeEmittedWorkflowResult(engine);
    expect(vTruth(emitted.workflowTruthReport)).toBe(true);
    expect(vResult(emitted)).toBe(true);
  });

  it("workflow-result (emitted) rejects v5-only document without workflowTruthReport", () => {
    const v = loadSchemaValidator("workflow-result");
    const v5only = {
      schemaVersion: 5,
      workflowId: "w",
      status: "complete",
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
      steps: [],
    };
    expect(v(v5only)).toBe(false);
  });

  it("workflow-result-compare-input accepts v7 engine, v9 frozen, and v11 emitted", () => {
    const vCmp = loadSchemaValidator("workflow-result-compare-input");
    const engine: WorkflowEngineResult = {
      schemaVersion: 7,
      workflowId: "w",
      status: "complete",
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: emptyCtx,
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: { narrative: "" },
          observedExecution: { paramsCanonical: "{}" },
          verificationRequest: {
            kind: "sql_row",
            table: "c",
            keyColumn: "id",
            keyValue: "1",
            requiredFields: {},
          },
          status: "verified",
          reasons: [],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    expect(vCmp(engine)).toBe(true);
    const emitted = finalizeEmittedWorkflowResult(engine);
    expect(vCmp(emitted)).toBe(true);
    const v9Compat = {
      ...emitted,
      schemaVersion: 9,
      runLevelCodes: emitted.runLevelReasons.map((r) => r.code),
    };
    expect(vCmp(v9Compat)).toBe(true);
  });

  it("workflow-result v11 rejects stray runLevelCodes", () => {
    const v = loadSchemaValidator("workflow-result");
    const engine: WorkflowEngineResult = {
      schemaVersion: 7,
      workflowId: "w",
      status: "complete",
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: emptyCtx,
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: { narrative: "" },
          observedExecution: { paramsCanonical: "{}" },
          verificationRequest: {
            kind: "sql_row",
            table: "c",
            keyColumn: "id",
            keyValue: "1",
            requiredFields: {},
          },
          status: "verified",
          reasons: [],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    const good = finalizeEmittedWorkflowResult(engine);
    expect(v(good)).toBe(true);
    const bad = { ...good, runLevelCodes: [] as string[] };
    expect(v(bad)).toBe(false);
  });

  it("cli-error-envelope minimal instance validates", () => {
    const v = loadSchemaValidator("cli-error-envelope");
    const env = {
      schemaVersion: 2,
      kind: "execution_truth_layer_error",
      code: "CLI_USAGE",
      message: "test",
      failureDiagnosis: {
        summary: "s",
        primaryOrigin: "workflow_flow",
        confidence: "high",
        evidence: [{ referenceCode: "CLI_USAGE" }],
        actionableFailure: { category: "bad_input", severity: "low" },
      },
    };
    expect(v(env)).toBe(true);
  });

  it("validates registry-validation-result (golden objects)", () => {
    const v = loadSchemaValidator("registry-validation-result");
    const minimal = {
      schemaVersion: 1,
      valid: true,
      structuralIssues: [],
      resolutionIssues: [],
      resolutionSkipped: [],
    };
    expect(v(minimal)).toBe(true);
    expect(
      v({
        ...minimal,
        eventLoad: { workflowId: "w", malformedEventLineCount: 0 },
      }),
    ).toBe(true);
    expect(
      v({
        schemaVersion: 1,
        valid: false,
        structuralIssues: [],
        resolutionIssues: [
          {
            workflowId: "w",
            code: "NO_STEPS_FOR_WORKFLOW",
            message: "No tool_observed events for this workflow id after filtering.",
            seq: null,
            toolId: null,
          },
        ],
        resolutionSkipped: [],
        eventLoad: { workflowId: "w", malformedEventLineCount: 2 },
      }),
    ).toBe(true);
  });
});
