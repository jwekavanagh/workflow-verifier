import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EXECUTION_PATH_EMPTY,
  VERIFICATION_BASIS_LINE,
  formatSqlEvidenceDetailForTrustPanel,
  renderComparePanelHtml,
  renderRunTrustPanelHtml,
} from "./debugPanels.js";
import { buildRunComparisonReport } from "./runComparison.js";
import type { StepOutcome, WorkflowEngineResult, WorkflowResult } from "./types.js";
import { createEmptyVerificationRunContext } from "./verificationRunContext.js";
import { finalizeEmittedWorkflowResult } from "./workflowTruthReport.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function sqlRowStep(seq: number, keyValue: string, verified: boolean): StepOutcome {
  return {
    seq,
    toolId: "t",
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
    reasons: verified ? [] : [{ code: "ROW_ABSENT", message: "m" }],
    evidenceSummary: verified ? { rowCount: 1 } : { rowCount: 0 },
    repeatObservationCount: 1,
    evaluatedObservationOrdinal: 1,
    ...(verified ? {} : { failureDiagnostic: "workflow_execution" as const }),
  };
}

function wf(steps: StepOutcome[]): WorkflowResult {
  const bad = steps.some((s) => s.status !== "verified");
  const engine: WorkflowEngineResult = {
    schemaVersion: 7,
    workflowId: "w",
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

describe("debugPanels", () => {
  it("formatSqlEvidenceDetailForTrustPanel null request", () => {
    const step: StepOutcome = {
      seq: 0,
      toolId: "x",
      intendedEffect: { narrative: "" },
      observedExecution: { paramsCanonical: "{}" },
      verificationRequest: null,
      status: "incomplete_verification",
      reasons: [{ code: "UNKNOWN_TOOL", message: "u" }],
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
      failureDiagnostic: "verification_setup",
    };
    expect(formatSqlEvidenceDetailForTrustPanel(step)).toBe(
      "No SQL verification request (registry resolution or unknown tool).",
    );
  });

  it("renderComparePanelHtml includes required data-etl hooks", () => {
    const r0 = wf([sqlRowStep(0, "a", true)]);
    const r1 = wf([sqlRowStep(0, "a", true)]);
    const report = buildRunComparisonReport([r0, r1], ["a", "b"]);
    const html = renderComparePanelHtml(report);
    expect(html).toContain('data-etl-section="compare-result"');
    expect(html).toContain("data-etl-headline");
    expect(html).toContain("data-etl-window-trend");
    expect(html).toContain("data-etl-pairwise-trend");
    expect(html).toContain("data-etl-recurrence");
    expect(html).toContain('data-etl-list="introduced"');
    expect(html).toContain('data-etl-list="resolved"');
    expect(html).toContain('data-etl-list="recurring"');
  });

  it("renderRunTrustPanelHtml includes verification basis and table", () => {
    const w = wf([sqlRowStep(0, "c_ok", true)]);
    const html = renderRunTrustPanelHtml(w);
    expect(html).toContain(VERIFICATION_BASIS_LINE);
    expect(html).toContain('data-etl-table="verify-evidence"');
    expect(html).toContain('data-etl-seq="0"');
    expect(html).toContain('data-etl-field="sql-evidence"');
    expect(html).toContain("rowCount=1");
  });

  it("renderRunTrustPanelHtml matches expected-strings for fixture run_path_empty", () => {
    const raw = readFileSync(
      join(root, "test/fixtures/debug-ui-slice6/run_path_empty/workflow-result.json"),
      "utf8",
    );
    const w = JSON.parse(raw) as WorkflowResult;
    const html = renderRunTrustPanelHtml(w);
    const exp = JSON.parse(
      readFileSync(join(root, "test/fixtures/debug-ui-slice6/expected-strings.json"), "utf8"),
    ) as { executionPathEmpty: string };
    expect(html).toContain(exp.executionPathEmpty);
    expect(html).toContain('data-etl-execution-path-empty');
  });

  it("EXECUTION_PATH_EMPTY constant matches expected-strings.json", () => {
    const exp = JSON.parse(
      readFileSync(join(root, "test/fixtures/debug-ui-slice6/expected-strings.json"), "utf8"),
    ) as { executionPathEmpty: string };
    expect(EXECUTION_PATH_EMPTY).toBe(exp.executionPathEmpty);
  });
});
