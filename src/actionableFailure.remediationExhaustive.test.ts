import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deriveActionableFailureWorkflow,
  EVENT_SEQUENCE_CODE_TO_REMEDIATION,
  productionStepReasonCodeToRemediation,
  RUN_CONTEXT_CODE_TO_REMEDIATION,
  RUN_LEVEL_CODE_TO_REMEDIATION,
} from "./actionableFailure.js";
import { CLI_OPERATIONAL_CODES } from "./cliOperationalCodes.js";
import { cliErrorEnvelope } from "./failureCatalog.js";
import { OPERATIONAL_CODE_TO_SUMMARY, PRODUCTION_STEP_REASON_CODES } from "./failureOriginCatalog.js";
import { OPERATIONAL_DISPOSITION } from "./operationalDisposition.js";
import { buildRunComparisonReport } from "./runComparison.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import type { FailureAnalysisBase, StepOutcome, WorkflowEngineResult, WorkflowResult } from "./types.js";
import { createEmptyVerificationRunContext } from "./verificationRunContext.js";
import { finalizeEmittedWorkflowResult } from "./workflowTruthReport.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const strongPolicy = {
  consistencyMode: "strong" as const,
  verificationWindowMs: 0,
  pollIntervalMs: 0,
};

function baseEngine(partial: Partial<WorkflowEngineResult>): WorkflowEngineResult {
  return {
    schemaVersion: 8,
    workflowId: "w",
    status: "inconsistent",
    runLevelReasons: [],
    verificationPolicy: strongPolicy,
    eventSequenceIntegrity: { kind: "normal" },
    verificationRunContext: createEmptyVerificationRunContext(),
    steps: [],
    ...partial,
  };
}

function minimalFailureAnalysisForPrimaryStepCode(code: string): FailureAnalysisBase {
  return {
    summary: "s",
    primaryOrigin: "downstream_system_state",
    confidence: "high",
    unknownReasonCodes: [],
    evidence: [{ scope: "step", seq: 0, toolId: "t", codes: [code] }],
  };
}

function minimalFailureAnalysisForRunLevelCodes(codes: string[]): FailureAnalysisBase {
  return {
    summary: "s",
    primaryOrigin: "inputs",
    confidence: "high",
    unknownReasonCodes: [],
    evidence: [{ scope: "run_level", codes }],
  };
}

function minimalFailureAnalysisForEventSequenceCodes(codes: string[]): FailureAnalysisBase {
  return {
    summary: "s",
    primaryOrigin: "workflow_flow",
    confidence: "high",
    unknownReasonCodes: [],
    evidence: [{ scope: "event_sequence", codes }],
  };
}

function minimalFailureAnalysisForRunContextCodes(codes: string[]): FailureAnalysisBase {
  return {
    summary: "s",
    primaryOrigin: "workflow_flow",
    confidence: "high",
    unknownReasonCodes: [],
    evidence: [{ scope: "run_context", codes }],
  };
}

function sqlRowStep(
  seq: number,
  toolId: string,
  keyValue: string,
  verified: boolean,
): StepOutcome {
  return {
    seq,
    toolId,
    intendedEffect: { narrative: "" },
    observedExecution: { paramsCanonical: "{}" },
    verificationRequest: {
      kind: "sql_row",
      table: "contacts",
      identityEq: [{ column: "id", value: keyValue }],
      requiredFields: {},
    },
    status: verified ? "verified" : "missing",
    reasons: verified ? [] : [{ code: "ROW_ABSENT", message: "absent" }],
    evidenceSummary: {},
    repeatObservationCount: 1,
    evaluatedObservationOrdinal: 1,
    ...(verified ? {} : { failureDiagnostic: "workflow_execution" as const }),
  };
}

function wfComplete(): WorkflowResult {
  const engine: WorkflowEngineResult = {
    schemaVersion: 8,
    workflowId: "w",
    status: "complete",
    runLevelReasons: [],
    verificationPolicy: strongPolicy,
    eventSequenceIntegrity: { kind: "normal" },
    verificationRunContext: createEmptyVerificationRunContext(),
    steps: [sqlRowStep(0, "t", "a", true)],
  };
  return finalizeEmittedWorkflowResult(engine);
}

function engMalformed(): WorkflowEngineResult {
  return {
    schemaVersion: 8,
    workflowId: "w",
    status: "incomplete",
    runLevelReasons: [{ code: "MALFORMED_EVENT_LINE", message: "bad" }],
    verificationPolicy: strongPolicy,
    eventSequenceIntegrity: { kind: "normal" },
    verificationRunContext: createEmptyVerificationRunContext(),
    steps: [],
  };
}

function engDuplicateRows(): WorkflowEngineResult {
  return {
    schemaVersion: 8,
    workflowId: "w",
    status: "inconsistent",
    runLevelReasons: [],
    verificationPolicy: strongPolicy,
    eventSequenceIntegrity: { kind: "normal" },
    verificationRunContext: createEmptyVerificationRunContext(),
    steps: [
      {
        seq: 0,
        toolId: "t",
        intendedEffect: { narrative: "" },
        observedExecution: { paramsCanonical: "{}" },
        verificationRequest: {
          kind: "sql_row",
          table: "c",
          identityEq: [{ column: "id", value: "1" }],
          requiredFields: {},
        },
        status: "inconsistent",
        reasons: [{ code: "DUPLICATE_ROWS", message: "d" }],
        evidenceSummary: {},
        repeatObservationCount: 1,
        evaluatedObservationOrdinal: 1,
        failureDiagnostic: "workflow_execution",
      },
    ],
  };
}

describe("remediation exhaustive (Module A)", () => {
  it("deriveActionableFailureWorkflow matches productionStepReasonCodeToRemediation for every production step code", () => {
    const engine = baseEngine({});
    for (const code of PRODUCTION_STEP_REASON_CODES) {
      const fa = minimalFailureAnalysisForPrimaryStepCode(code);
      const row = productionStepReasonCodeToRemediation(code);
      const af = deriveActionableFailureWorkflow(engine, fa);
      expect(af.recommendedAction, code).toBe(row.recommendedAction);
      expect(af.automationSafe, code).toBe(row.automationSafe);
    }
  });

  it("deriveActionableFailureWorkflow matches RUN_LEVEL_CODE_TO_REMEDIATION for each run-level map key", () => {
    const engine = baseEngine({});
    for (const key of Object.keys(RUN_LEVEL_CODE_TO_REMEDIATION)) {
      const expected = RUN_LEVEL_CODE_TO_REMEDIATION[key]!;
      const fa = minimalFailureAnalysisForRunLevelCodes([key]);
      const af = deriveActionableFailureWorkflow(engine, fa);
      expect(af.recommendedAction, key).toBe(expected.recommendedAction);
      expect(af.automationSafe, key).toBe(expected.automationSafe);
    }
  });

  it("deriveActionableFailureWorkflow matches EVENT_SEQUENCE_CODE_TO_REMEDIATION for each event-sequence map key", () => {
    const engine = baseEngine({
      eventSequenceIntegrity: {
        kind: "irregular",
        reasons: [{ code: "CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ", message: "m" }],
      },
    });
    for (const key of Object.keys(EVENT_SEQUENCE_CODE_TO_REMEDIATION)) {
      const expected = EVENT_SEQUENCE_CODE_TO_REMEDIATION[key]!;
      const fa = minimalFailureAnalysisForEventSequenceCodes([key]);
      const af = deriveActionableFailureWorkflow(engine, fa);
      expect(af.recommendedAction, key).toBe(expected.recommendedAction);
      expect(af.automationSafe, key).toBe(expected.automationSafe);
    }
  });

  it("deriveActionableFailureWorkflow matches RUN_CONTEXT_CODE_TO_REMEDIATION for each run-context map key", () => {
    const engine = baseEngine({});
    for (const key of Object.keys(RUN_CONTEXT_CODE_TO_REMEDIATION)) {
      const expected = RUN_CONTEXT_CODE_TO_REMEDIATION[key]!;
      const fa = minimalFailureAnalysisForRunContextCodes([key]);
      const af = deriveActionableFailureWorkflow(engine, fa);
      expect(af.recommendedAction, key).toBe(expected.recommendedAction);
      expect(af.automationSafe, key).toBe(expected.automationSafe);
    }
  });

  it("finalizeEmittedWorkflowResult DUPLICATE_ROWS integrates deduplicate remediation (AJV workflow-result)", () => {
    const out = finalizeEmittedWorkflowResult(engDuplicateRows());
    const v = loadSchemaValidator("workflow-result");
    expect(v(out)).toBe(true);
    expect(out.workflowTruthReport.failureAnalysis).not.toBeNull();
    expect(out.workflowTruthReport.failureAnalysis?.actionableFailure).toMatchObject({
      recommendedAction: "deduplicate",
      automationSafe: false,
    });
  });

  it("cliErrorEnvelope + OPERATIONAL_CODE_TO_SUMMARY: actionableFailure matches OPERATIONAL_DISPOSITION per code", () => {
    const v = loadSchemaValidator("cli-error-envelope");
    for (const code of Object.values(CLI_OPERATIONAL_CODES)) {
      const raw = cliErrorEnvelope(code, OPERATIONAL_CODE_TO_SUMMARY[code]);
      const parsed = JSON.parse(raw) as {
        failureDiagnosis: { actionableFailure: Record<string, unknown> };
      };
      expect(v(parsed)).toBe(true);
      const row = OPERATIONAL_DISPOSITION[code];
      expect(parsed.failureDiagnosis.actionableFailure).toMatchObject({
        category: row.actionableCategory,
        severity: row.actionableSeverity,
        recommendedAction: row.recommendedAction,
        automationSafe: row.automationSafe,
      });
    }
  });

  it("unknown operational code yields fixed actionableFailure (cliErrorEnvelope only)", () => {
    const v = loadSchemaValidator("cli-error-envelope");
    const parsed = JSON.parse(cliErrorEnvelope("NOT_A_REAL_OPERATIONAL_CODE", "operational failure")) as {
      failureDiagnosis: { actionableFailure: Record<string, unknown> };
    };
    expect(v(parsed)).toBe(true);
    expect(parsed.failureDiagnosis.actionableFailure).toEqual({
      category: "unclassified",
      severity: "medium",
      recommendedAction: "manual_review",
      automationSafe: false,
    });
  });

  it("buildRunComparisonReport perRunActionableFailures: two failing runs + trusted complete sentinel", () => {
    const r0 = finalizeEmittedWorkflowResult(engMalformed());
    const r1 = finalizeEmittedWorkflowResult(engDuplicateRows());
    const r2 = wfComplete();
    const report = buildRunComparisonReport([r0, r1, r2], ["a", "b", "c"]);
    const v = loadSchemaValidator("run-comparison-report");
    expect(report.schemaVersion).toBe(4);
    expect(v(report)).toBe(true);
    const p0 = report.perRunActionableFailures.find((p) => p.runIndex === 0)!;
    const p1 = report.perRunActionableFailures.find((p) => p.runIndex === 1)!;
    const p2 = report.perRunActionableFailures.find((p) => p.runIndex === 2)!;
    expect(p0.category).toBe("bad_input");
    expect(p0.recommendedAction).toBe("fix_event_ingest_and_steps");
    expect(p0.automationSafe).toBe(false);
    expect(p1.category).toBe("state_inconsistency");
    expect(p1.recommendedAction).toBe("deduplicate");
    expect(p1.automationSafe).toBe(false);
    expect(p2).toMatchObject({
      category: "complete",
      severity: "low",
      recommendedAction: "none",
      automationSafe: true,
    });
  });
});

describe("operational success: no stderr envelope (Module A negative)", () => {
  let dir: string;
  let dbPath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "etl-remediation-cli-"));
    dbPath = join(dir, "test.db");
    const sql = readFileSync(join(root, "examples", "seed.sql"), "utf8");
    const db = new DatabaseSync(dbPath);
    db.exec(sql);
    db.close();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("wf_complete --no-truth-report: stdout valid, failureAnalysis null, no execution_truth_layer_error", () => {
    const cliJs = join(root, "dist", "cli.js");
    const eventsPath = join(root, "examples", "events.ndjson");
    const registryPath = join(root, "examples", "tools.json");
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "--workflow-id",
        "wf_complete",
        "--events",
        eventsPath,
        "--registry",
        registryPath,
        "--db",
        dbPath,
        "--no-truth-report",
      ],
      { encoding: "utf8", cwd: root },
    );
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    const parsed = JSON.parse(r.stdout.trim()) as WorkflowResult;
    const validateResult = loadSchemaValidator("workflow-result");
    expect(validateResult(parsed)).toBe(true);
    expect(parsed.workflowId).toBe("wf_complete");
    expect(parsed.workflowTruthReport.failureAnalysis).toBeNull();
    expect(r.stdout).not.toContain("execution_truth_layer_error");
  });
});
