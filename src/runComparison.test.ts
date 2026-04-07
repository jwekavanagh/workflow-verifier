import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLI_OPERATIONAL_CODES } from "./failureCatalog.js";
import { COMPARE_INPUT_RUN_LEVEL_INCONSISTENT_MESSAGE } from "./runLevelDriftMessages.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import {
  buildRunComparisonReport,
  formatRunComparisonReport,
  recurrenceSignature,
} from "./runComparison.js";
import type { StepOutcome, WorkflowEngineResult, WorkflowResult } from "./types.js";
import {
  createEmptyVerificationRunContext,
} from "./verificationRunContext.js";
import { finalizeEmittedWorkflowResult } from "./workflowTruthReport.js";
import { workflowEngineResultFromEmitted } from "./workflowResultNormalize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliJs = join(root, "dist", "cli.js");

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
      keyColumn: "id",
      keyValue,
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

function wf(steps: StepOutcome[], id = "wf_cmp"): WorkflowResult {
  const bad = steps.some((s) => s.status !== "verified");
  const engine: WorkflowEngineResult = {
    schemaVersion: 7,
    workflowId: id,
    status: bad ? "inconsistent" : "complete",
    runLevelReasons: [],
    verificationPolicy: {
      consistencyMode: "strong",
      verificationWindowMs: 0,
      pollIntervalMs: 0,
    },
    eventSequenceIntegrity: { kind: "normal" },
    verificationRunContext: createEmptyVerificationRunContext(),
    steps,
  };
  return finalizeEmittedWorkflowResult(engine);
}

function assertReportValid(report: ReturnType<typeof buildRunComparisonReport>): void {
  const v = loadSchemaValidator("run-comparison-report");
  expect(v(report)).toBe(true);
}

describe("runComparison", () => {
  it("buildRunComparisonReport v4 perRunActionableFailures includes recommendedAction and automationSafe", () => {
    const ok = wf([sqlRowStep(0, "t", "a", true)]);
    const bad = wf([sqlRowStep(0, "t", "a", false)]);
    const report = buildRunComparisonReport([ok, bad], ["ok", "bad"]);
    expect(report.schemaVersion).toBe(4);
    assertReportValid(report);
    const complete = report.perRunActionableFailures.find((p) => p.runIndex === 0);
    const failing = report.perRunActionableFailures.find((p) => p.runIndex === 1);
    expect(complete).toMatchObject({
      category: "complete",
      severity: "low",
      recommendedAction: "none",
      automationSafe: true,
    });
    expect(failing).toMatchObject({
      category: "ambiguous",
      severity: "high",
      recommendedAction: "manual_review",
      automationSafe: false,
    });
  });

  it("P1 reorder all verified: unchangedOk per key, seq movement, no failure deltas", () => {
    const r0 = wf([sqlRowStep(0, "t1", "a", true), sqlRowStep(1, "t1", "b", true)]);
    const r1 = wf([sqlRowStep(0, "t1", "b", true), sqlRowStep(1, "t1", "a", true)]);
    const report = buildRunComparisonReport([r0, r1], ["r0", "r1"]);
    assertReportValid(report);
    const ok = report.pairwise.bucketA.filter((e) => e.kind === "unchangedOk");
    expect(ok).toHaveLength(2);
    const moved = ok.filter((e) => e.seqPrior !== e.seqCurrent);
    expect(moved.length).toBeGreaterThanOrEqual(1);
    const failures = report.pairwise.bucketA.filter(
      (e) => e.kind === "introducedFailure" || e.kind === "resolvedFailure" || e.kind === "bothFailing",
    );
    expect(failures).toHaveLength(0);
  });

  it("P2 reorder same key still failing: bothFailing, empty reason deltas", () => {
    const r0 = wf([sqlRowStep(0, "t1", "a", false), sqlRowStep(1, "t1", "b", true)]);
    const r1 = wf([sqlRowStep(0, "t1", "b", true), sqlRowStep(1, "t1", "a", false)]);
    const report = buildRunComparisonReport([r0, r1], ["r0", "r1"]);
    assertReportValid(report);
    const bf = report.pairwise.bucketA.find((e) => e.kind === "bothFailing");
    expect(bf).toBeDefined();
    if (bf?.kind === "bothFailing") {
      expect(bf.introducedStepReasonCodes).toEqual([]);
      expect(bf.resolvedStepReasonCodes).toEqual([]);
      expect(bf.seqPrior).not.toBe(bf.seqCurrent);
    }
    expect(report.pairwise.bucketA.some((e) => e.kind === "introducedFailure")).toBe(false);
    expect(report.pairwise.bucketA.some((e) => e.kind === "resolvedFailure")).toBe(false);
  });

  it("P3 regression under reorder: introducedFailure for key", () => {
    const r0 = wf([sqlRowStep(0, "t1", "a", true), sqlRowStep(1, "t1", "b", true)]);
    const r1 = wf([sqlRowStep(0, "t1", "b", true), sqlRowStep(1, "t1", "a", false)]);
    const report = buildRunComparisonReport([r0, r1], ["r0", "r1"]);
    assertReportValid(report);
    const intro = report.pairwise.bucketA.find((e) => e.kind === "introducedFailure");
    expect(intro).toBeDefined();
    expect(intro && "logicalStepKey" in intro && intro.logicalStepKey.includes("a")).toBe(true);
  });

  it("P4 fix under reorder: resolvedFailure for key", () => {
    const r0 = wf([sqlRowStep(0, "t1", "a", false), sqlRowStep(1, "t1", "b", true)]);
    const r1 = wf([sqlRowStep(0, "t1", "b", true), sqlRowStep(1, "t1", "a", true)]);
    const report = buildRunComparisonReport([r0, r1], ["r0", "r1"]);
    assertReportValid(report);
    const res = report.pairwise.bucketA.find((e) => e.kind === "resolvedFailure");
    expect(res).toBeDefined();
  });

  it("run-level multiset introduced and resolved", () => {
    const r0: WorkflowResult = {
      ...wf([sqlRowStep(0, "t", "x", true)]),
      runLevelReasons: [
        { code: "A", message: "a" },
        { code: "A", message: "a2" },
      ],
    };
    const r1: WorkflowResult = {
      ...wf([sqlRowStep(0, "t", "x", true)]),
      runLevelReasons: [{ code: "A", message: "a" }],
    };
    const report = buildRunComparisonReport([r0, r1], ["a", "b"]);
    assertReportValid(report);
    expect(report.pairwise.runLevel.resolvedRunLevelCodes).toEqual(["A"]);
    expect(report.pairwise.runLevel.introducedRunLevelCodes).toEqual([]);
  });

  it("sql_effects: both runs failing per effect with identical reason codes → effect delta bothFailing", () => {
    const vr = {
      kind: "sql_effects" as const,
      effects: [
        {
          id: "e1",
          kind: "sql_row" as const,
          table: "contacts",
          keyColumn: "id",
          keyValue: "1",
          requiredFields: {},
        },
      ],
    };
    const effectRow = {
      id: "e1",
      status: "missing" as const,
      reasons: [{ code: "ROW_ABSENT", message: "m" }],
    };
    const step: StepOutcome = {
      seq: 0,
      toolId: "t",
      intendedEffect: { narrative: "" },
      observedExecution: { paramsCanonical: "{}" },
      verificationRequest: vr,
      status: "inconsistent",
      reasons: [],
      evidenceSummary: { effects: [effectRow] },
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
      failureDiagnostic: "workflow_execution",
    };
    const report = buildRunComparisonReport([wf([step]), wf([{ ...step }])], ["p", "c"]);
    assertReportValid(report);
    const bf = report.pairwise.bucketA.find((e) => e.kind === "bothFailing");
    expect(bf?.kind).toBe("bothFailing");
    const ed = bf?.kind === "bothFailing" ? bf.effects.find((x) => x.effectId === "e1") : undefined;
    expect(ed?.kind).toBe("bothFailing");
    expect(ed?.introducedReasonCodes).toEqual([]);
    expect(ed?.resolvedReasonCodes).toEqual([]);
  });

  it("bothFailing step reason multiset churn", () => {
    const s0: StepOutcome = {
      ...sqlRowStep(0, "t", "a", false),
      reasons: [{ code: "ROW_ABSENT", message: "m" }],
    };
    const s1: StepOutcome = {
      ...sqlRowStep(0, "t", "a", false),
      reasons: [
        { code: "ROW_ABSENT", message: "m" },
        { code: "VALUE_MISMATCH", message: "v" },
      ],
    };
    const report = buildRunComparisonReport([wf([s0]), wf([s1])], ["p", "c"]);
    assertReportValid(report);
    const bf = report.pairwise.bucketA.find((e) => e.kind === "bothFailing");
    expect(bf && bf.kind === "bothFailing" && bf.introducedStepReasonCodes).toContain("VALUE_MISMATCH");
  });

  it("bucket B null-request multiset diff", () => {
    const nullFail = (seq: number, tool: string): StepOutcome => ({
      seq,
      toolId: tool,
      intendedEffect: { narrative: "" },
      observedExecution: { paramsCanonical: "{}" },
      verificationRequest: null,
      status: "incomplete_verification",
      reasons: [{ code: "UNKNOWN_TOOL", message: "u" }],
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
      failureDiagnostic: "verification_setup",
    });
    const r0 = wf([nullFail(0, "x")]);
    const r1 = wf([nullFail(0, "x"), nullFail(1, "y")]);
    const report = buildRunComparisonReport([r0, r1], ["p", "c"]);
    assertReportValid(report);
    const sig = recurrenceSignature(nullFail(0, "x"));
    const intro = report.pairwise.bucketB.introducedFailureSignatures.find((x) => x.signature === sig);
    expect(intro?.count).toBe(1);
  });

  it("recurrence across runs with seq shift (same signature)", () => {
    const failA = sqlRowStep(1, "tool", "a", false);
    const failB = sqlRowStep(3, "other", "a", false);
    const mid = wf([sqlRowStep(0, "t", "a", true)]);
    const r0 = wf([failA]);
    const r2 = wf([failB]);
    const report = buildRunComparisonReport([r0, mid, r2], ["r0", "r1", "r2"]);
    assertReportValid(report);
    const sig0 = recurrenceSignature(failA);
    const sig2 = recurrenceSignature(failB);
    expect(sig0).toBe(sig2);
    expect(report.recurrence.patterns.length).toBeGreaterThanOrEqual(1);
    const p = report.recurrence.patterns.find((x) => x.signature === sig0);
    expect(p?.runIndices).toEqual([0, 2]);
  });

  it("recurrenceSignature ignores toolId (same outcome, different tool)", () => {
    const a = sqlRowStep(0, "toolA", "k", false);
    const b = { ...sqlRowStep(0, "toolB", "k", false), seq: 5 };
    expect(recurrenceSignature(a)).toBe(recurrenceSignature(b));
  });

  it("formatRunComparisonReport includes cross_run_comparison header", () => {
    const r = buildRunComparisonReport(
      [wf([sqlRowStep(0, "t", "a", true)]), wf([sqlRowStep(0, "t", "a", true)])],
      ["a", "b"],
    );
    const text = formatRunComparisonReport(r);
    expect(text).toContain("cross_run_comparison:");
    expect(text).toContain("per_run_actionable:");
    expect(text).toContain("actionable_category_recurrence:");
    expect(text).toContain("recurrence_patterns:");
    expect(text).toContain("reliability_assessment:");
    expect(text).toContain("headline_verdict:");
    expect(text).toContain("compare_highlights:");
  });

  it("actionableCategoryRecurrence: streaks and indices along compare order", () => {
    const engMalformed = (): WorkflowEngineResult => ({
      schemaVersion: 7,
      workflowId: "w",
      status: "incomplete",
      runLevelReasons: [{ code: "MALFORMED_EVENT_LINE", message: "bad" }],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [],
    });
    const engDup = (): WorkflowEngineResult => ({
      schemaVersion: 7,
      workflowId: "w",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
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
            keyColumn: "id",
            keyValue: "1",
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
    });
    const r0 = finalizeEmittedWorkflowResult(engMalformed());
    const r1 = finalizeEmittedWorkflowResult(engMalformed());
    const r2 = finalizeEmittedWorkflowResult(engDup());
    const r3 = finalizeEmittedWorkflowResult(engMalformed());
    const report = buildRunComparisonReport([r0, r1, r2, r3], ["0", "1", "2", "3"]);
    assertReportValid(report);
    const badInput = report.actionableCategoryRecurrence.find((x) => x.category === "bad_input");
    expect(badInput?.runIndicesAscending).toEqual([0, 1, 3]);
    expect(badInput?.runsHitCount).toBe(3);
    expect(badInput?.maxConsecutiveRunStreak).toBe(2);
    const state = report.actionableCategoryRecurrence.find((x) => x.category === "state_inconsistency");
    expect(state?.runIndicesAscending).toEqual([2]);
    expect(state?.maxConsecutiveRunStreak).toBe(1);
    expect(report.categoryHistogram.find((h) => h.category === "bad_input")?.count).toBe(3);
    expect(report.categoryHistogram.find((h) => h.category === "state_inconsistency")?.count).toBe(1);
    const histSum = report.categoryHistogram.reduce((s, h) => s + h.count, 0);
    expect(histSum).toBe(4);
    expect(report.perRunActionableFailures).toHaveLength(4);
  });

  it("CLI compare succeeds and stderr precedes valid stdout JSON", () => {
    const golden = join(root, "test", "golden", "wf_multi_ok.stdout.json");
    const raw = readFileSync(golden, "utf8");
    const dir = mkdtempSync(join(tmpdir(), "etl-cmp-"));
    try {
      const p1 = join(dir, "a.json");
      const p2 = join(dir, "b.json");
      writeFileSync(p1, raw);
      writeFileSync(p2, raw);
      const proc = spawnSync(process.execPath, ["--no-warnings", cliJs, "compare", "--prior", p1, "--current", p2], {
        encoding: "utf8",
        cwd: root,
      });
      expect(proc.status, proc.stderr).toBe(0);
      const out = proc.stdout.trim();
      expect(out.length).toBeGreaterThan(0);
      const parsed = JSON.parse(out) as { schemaVersion: number };
      expect(parsed.schemaVersion).toBe(4);
      const v = loadSchemaValidator("run-comparison-report");
      expect(v(JSON.parse(out))).toBe(true);
      expect(proc.stderr).toContain("cross_run_comparison:");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CLI compare v9 runLevel drift: exit 3 COMPARE_INPUT_RUN_LEVEL_INCONSISTENT", () => {
    const golden = JSON.parse(
      readFileSync(join(root, "test", "golden", "wf_multi_ok.stdout.json"), "utf8"),
    ) as WorkflowResult;
    const dir = mkdtempSync(join(tmpdir(), "etl-cmp-rl-"));
    try {
      const drifting = {
        ...golden,
        schemaVersion: 9,
        runLevelCodes: ["A"],
        runLevelReasons: [{ code: "B", message: "mismatch" }],
      };
      const p1 = join(dir, "bad.json");
      const p2 = join(dir, "ok.json");
      writeFileSync(p1, JSON.stringify(drifting));
      writeFileSync(p2, JSON.stringify(golden));
      const proc = spawnSync(
        process.execPath,
        ["--no-warnings", cliJs, "compare", "--prior", p1, "--current", p2],
        { encoding: "utf8", cwd: root },
      );
      expect(proc.status).toBe(3);
      expect(proc.stdout.trim()).toBe("");
      const err = JSON.parse(proc.stderr.trim());
      expect(err.code).toBe(CLI_OPERATIONAL_CODES.COMPARE_INPUT_RUN_LEVEL_INCONSISTENT);
      expect(err.message).toBe(COMPARE_INPUT_RUN_LEVEL_INCONSISTENT_MESSAGE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CLI compare invalid JSON: exit 3, empty stdout, envelope on stderr", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-cmp-bad-"));
    try {
      const p1 = join(dir, "a.json");
      const p2 = join(dir, "b.json");
      writeFileSync(p1, "{");
      writeFileSync(p2, readFileSync(join(root, "test", "golden", "wf_multi_ok.stdout.json"), "utf8"));
      const proc = spawnSync(process.execPath, ["--no-warnings", cliJs, "compare", "--prior", p1, "--current", p2], {
        encoding: "utf8",
        cwd: root,
      });
      expect(proc.status).toBe(3);
      expect(proc.stdout.trim()).toBe("");
      const err = JSON.parse(proc.stderr.trim());
      expect(err.code).toBe(CLI_OPERATIONAL_CODES.COMPARE_INPUT_JSON_SYNTAX);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CLI compare workflowId mismatch: exit 3, empty stdout", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-cmp-mis-"));
    try {
      const a = JSON.parse(readFileSync(join(root, "test", "golden", "wf_multi_ok.stdout.json"), "utf8")) as WorkflowResult;
      const b = finalizeEmittedWorkflowResult({
        ...workflowEngineResultFromEmitted(a),
        workflowId: "other",
      });
      const p1 = join(dir, "a.json");
      const p2 = join(dir, "b.json");
      writeFileSync(p1, JSON.stringify(a));
      writeFileSync(p2, JSON.stringify(b));
      const proc = spawnSync(process.execPath, ["--no-warnings", cliJs, "compare", "--prior", p1, "--current", p2], {
        encoding: "utf8",
        cwd: root,
      });
      expect(proc.status).toBe(3);
      expect(proc.stdout.trim()).toBe("");
      const err = JSON.parse(proc.stderr.trim());
      expect(err.code).toBe(CLI_OPERATIONAL_CODES.COMPARE_WORKFLOW_ID_MISMATCH);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CLI compare v6 tampered workflowTruthReport: exit 3 COMPARE_WORKFLOW_TRUTH_MISMATCH", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-cmp-tam-"));
    try {
      const a = JSON.parse(readFileSync(join(root, "test", "golden", "wf_multi_ok.stdout.json"), "utf8")) as WorkflowResult;
      const b = structuredClone(a);
      b.workflowTruthReport = { ...b.workflowTruthReport, trustSummary: "tampered" };
      const p1 = join(dir, "a.json");
      const p2 = join(dir, "b.json");
      writeFileSync(p1, JSON.stringify(a));
      writeFileSync(p2, JSON.stringify(b));
      const proc = spawnSync(process.execPath, ["--no-warnings", cliJs, "compare", "--prior", p1, "--current", p2], {
        encoding: "utf8",
        cwd: root,
      });
      expect(proc.status).toBe(3);
      expect(proc.stdout.trim()).toBe("");
      const err = JSON.parse(proc.stderr.trim());
      expect(err.code).toBe(CLI_OPERATIONAL_CODES.COMPARE_WORKFLOW_TRUTH_MISMATCH);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
