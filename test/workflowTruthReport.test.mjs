import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatWorkflowTruthReport,
  STEP_STATUS_TRUTH_LABELS,
} from "../dist/workflowTruthReport.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function normTruthText(s) {
  return s.replace(/\r\n/g, "\n").trimEnd();
}

const GOLDEN_COMPLETE = `workflow_id: wf_complete
workflow_status: complete
trust: TRUSTED: Every step matched the database under the configured verification rules.
run_level: (none)
steps:
  - seq=0 tool=crm.upsert_contact status=VERIFIED
    observations: evaluated=1 of 1 in_capture_order
    intended: Upsert contact "c_ok" with fields {"name":"Alice","status":"active"}`;

const GOLDEN_MISSING = `workflow_id: wf_missing
workflow_status: inconsistent
trust: NOT_TRUSTED: At least one step failed verification against the database (determinate failure).
run_level: (none)
steps:
  - seq=0 tool=crm.upsert_contact status=FAILED_ROW_MISSING
    observations: evaluated=1 of 1 in_capture_order
    reason: [ROW_ABSENT] No row matched key
    intended: Upsert contact "missing_id" with fields {"name":"X","status":"Y"}`;

const GOLDEN_INCOMPLETE_UNKNOWN_TOOL = `workflow_id: wf_unknown_tool
workflow_status: incomplete
trust: NOT_TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.
run_level: (none)
steps:
  - seq=0 tool=nope.tool status=INCOMPLETE_CANNOT_VERIFY
    observations: evaluated=1 of 1 in_capture_order
    reason: [UNKNOWN_TOOL] Unknown toolId: nope.tool
    intended: Unknown tool: nope.tool`;

const MALFORMED_MSG =
  "Event line was missing, invalid JSON, or failed schema validation for a tool observation.";
const NO_STEPS_MSG = "No tool_observed events for this workflow id after filtering.";

const GOLDEN_MALFORMED = `workflow_id: wf_complete
workflow_status: incomplete
trust: NOT_TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.
run_level:
  - MALFORMED_EVENT_LINE: ${MALFORMED_MSG}
  - NO_STEPS_FOR_WORKFLOW: ${NO_STEPS_MSG}
steps:`;

const GOLDEN_EMPTY_STEPS = `workflow_id: no_such_workflow
workflow_status: incomplete
trust: NOT_TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.
run_level:
  - NO_STEPS_FOR_WORKFLOW: ${NO_STEPS_MSG}
steps:`;

const GOLDEN_UNKNOWN_RUN_LEVEL = `workflow_id: w
workflow_status: complete
trust: TRUSTED: Every step matched the database under the configured verification rules.
run_level:
  - UNKNOWN_CODE_X: Unknown run-level code (forward compatibility).
steps:
  - seq=0 tool=t status=VERIFIED
    observations: evaluated=1 of 1 in_capture_order`;

describe("formatWorkflowTruthReport", () => {
  it("golden complete / inconsistent missing / incomplete unknown tool", () => {
    const complete = {
      schemaVersion: 2,
      workflowId: "wf_complete",
      status: "complete",
      runLevelCodes: [],
      runLevelReasons: [],
      steps: [
        {
          seq: 0,
          toolId: "crm.upsert_contact",
          intendedEffect: 'Upsert contact "c_ok" with fields {"name":"Alice","status":"active"}',
          verificationRequest: {},
          status: "verified",
          reasons: [],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    assert.equal(formatWorkflowTruthReport(complete), GOLDEN_COMPLETE);

    const missing = {
      schemaVersion: 2,
      workflowId: "wf_missing",
      status: "inconsistent",
      runLevelCodes: [],
      runLevelReasons: [],
      steps: [
        {
          seq: 0,
          toolId: "crm.upsert_contact",
          intendedEffect: 'Upsert contact "missing_id" with fields {"name":"X","status":"Y"}',
          verificationRequest: {},
          status: "missing",
          reasons: [{ code: "ROW_ABSENT", message: "No row matched key" }],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    assert.equal(formatWorkflowTruthReport(missing), GOLDEN_MISSING);

    const unknownTool = {
      schemaVersion: 2,
      workflowId: "wf_unknown_tool",
      status: "incomplete",
      runLevelCodes: [],
      runLevelReasons: [],
      steps: [
        {
          seq: 0,
          toolId: "nope.tool",
          intendedEffect: "Unknown tool: nope.tool",
          verificationRequest: null,
          status: "incomplete_verification",
          reasons: [{ code: "UNKNOWN_TOOL", message: "Unknown toolId: nope.tool" }],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    assert.equal(formatWorkflowTruthReport(unknownTool), GOLDEN_INCOMPLETE_UNKNOWN_TOOL);
  });

  it("golden malformed run-level and empty steps", () => {
    const malformed = {
      schemaVersion: 2,
      workflowId: "wf_complete",
      status: "incomplete",
      runLevelCodes: ["MALFORMED_EVENT_LINE", "NO_STEPS_FOR_WORKFLOW"],
      runLevelReasons: [
        { code: "MALFORMED_EVENT_LINE", message: MALFORMED_MSG },
        { code: "NO_STEPS_FOR_WORKFLOW", message: NO_STEPS_MSG },
      ],
      steps: [],
    };
    assert.equal(formatWorkflowTruthReport(malformed), GOLDEN_MALFORMED);

    const empty = {
      schemaVersion: 2,
      workflowId: "no_such_workflow",
      status: "incomplete",
      runLevelCodes: ["NO_STEPS_FOR_WORKFLOW"],
      runLevelReasons: [{ code: "NO_STEPS_FOR_WORKFLOW", message: NO_STEPS_MSG }],
      steps: [],
    };
    assert.equal(formatWorkflowTruthReport(empty), GOLDEN_EMPTY_STEPS);
  });

  it("unknown run-level code uses fallback explanation", () => {
    const r = {
      schemaVersion: 2,
      workflowId: "w",
      status: "complete",
      runLevelCodes: ["UNKNOWN_CODE_X"],
      runLevelReasons: [
        { code: "UNKNOWN_CODE_X", message: "Unknown run-level code (forward compatibility)." },
      ],
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: "",
          verificationRequest: null,
          status: "verified",
          reasons: [],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    assert.equal(formatWorkflowTruthReport(r), GOLDEN_UNKNOWN_RUN_LEVEL);
  });

  it("multi-step: each step line uses STEP_STATUS_TRUTH_LABELS", () => {
    const result = {
      schemaVersion: 2,
      workflowId: "multi",
      status: "inconsistent",
      runLevelCodes: [],
      runLevelReasons: [],
      steps: [
        {
          seq: 0,
          toolId: "a",
          intendedEffect: "",
          verificationRequest: null,
          status: "verified",
          reasons: [],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
        {
          seq: 1,
          toolId: "b",
          intendedEffect: "",
          verificationRequest: null,
          status: "missing",
          reasons: [{ code: "X", message: "y" }],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
        {
          seq: 2,
          toolId: "c",
          intendedEffect: "",
          verificationRequest: null,
          status: "inconsistent",
          reasons: [{ code: "P", message: "q" }],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    const out = formatWorkflowTruthReport(result);
    for (const s of result.steps) {
      const label = STEP_STATUS_TRUTH_LABELS[s.status];
      assert.ok(
        out.includes(`seq=${s.seq} tool=${s.toolId} status=${label}`),
        `expected step line for seq=${s.seq}`,
      );
    }
  });

  it("golden wf_multi_partial stderr matches formatWorkflowTruthReport(stdout artifact)", () => {
    const stdoutPath = join(root, "test/golden/wf_multi_partial.stdout.json");
    const stderrPath = join(root, "test/golden/wf_multi_partial.stderr.txt");
    const result = JSON.parse(readFileSync(stdoutPath, "utf8"));
    const expected = normTruthText(readFileSync(stderrPath, "utf8"));
    assert.equal(normTruthText(formatWorkflowTruthReport(result)), expected);
  });

  it("all StepStatus values appear with correct status= token", () => {
    const statuses = [
      "verified",
      "missing",
      "inconsistent",
      "incomplete_verification",
      "partially_verified",
    ];
    let seq = 0;
    const steps = statuses.map((status) => ({
      seq: seq++,
      toolId: "t",
      intendedEffect: "",
      verificationRequest: null,
      status,
      reasons: [],
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
    }));
    const r = {
      schemaVersion: 2,
      workflowId: "s",
      status: "incomplete",
      runLevelCodes: [],
      runLevelReasons: [],
      steps,
    };
    const out = formatWorkflowTruthReport(r);
    for (const status of statuses) {
      assert.ok(out.includes(`status=${STEP_STATUS_TRUTH_LABELS[status]}`));
    }
  });

  it("run-level reason message is trimmed; whitespace-only becomes (no message)", () => {
    const trimmed = {
      schemaVersion: 2,
      workflowId: "w",
      status: "complete",
      runLevelCodes: ["X"],
      runLevelReasons: [{ code: "X", message: "  hello  " }],
      steps: [],
    };
    assert.ok(formatWorkflowTruthReport(trimmed).includes("  - X: hello"));

    const blank = {
      schemaVersion: 2,
      workflowId: "w",
      status: "complete",
      runLevelCodes: ["Y"],
      runLevelReasons: [{ code: "Y", message: "   \t  " }],
      steps: [],
    };
    assert.ok(formatWorkflowTruthReport(blank).includes("  - Y: (no message)"));
  });

  it("empty reason message renders (no message)", () => {
    const r = {
      schemaVersion: 2,
      workflowId: "w",
      status: "incomplete",
      runLevelCodes: [],
      runLevelReasons: [],
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: "",
          verificationRequest: null,
          status: "incomplete_verification",
          reasons: [{ code: "C", message: "   " }],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    const out = formatWorkflowTruthReport(r);
    assert.ok(out.includes("reason: [C] (no message)"));
  });

  it("reason with field appends field=", () => {
    const r = {
      schemaVersion: 2,
      workflowId: "w",
      status: "incomplete",
      runLevelCodes: [],
      runLevelReasons: [],
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: "",
          verificationRequest: null,
          status: "incomplete_verification",
          reasons: [{ code: "E", message: "msg", field: "col" }],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    assert.ok(formatWorkflowTruthReport(r).includes("reason: [E] msg field=col"));
  });

  it("newlines in toolId sanitized", () => {
    const r = {
      schemaVersion: 2,
      workflowId: "w",
      status: "complete",
      runLevelCodes: [],
      runLevelReasons: [],
      steps: [
        {
          seq: 0,
          toolId: "bad\nid",
          intendedEffect: "",
          verificationRequest: null,
          status: "verified",
          reasons: [],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    assert.ok(formatWorkflowTruthReport(r).includes("tool=bad_id"));
  });

  it("intendedEffect newlines collapsed to single line", () => {
    const r = {
      schemaVersion: 2,
      workflowId: "w",
      status: "complete",
      runLevelCodes: [],
      runLevelReasons: [],
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: "line1\nline2",
          verificationRequest: null,
          status: "verified",
          reasons: [],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    assert.ok(formatWorkflowTruthReport(r).includes("intended: line1 line2"));
  });
});
