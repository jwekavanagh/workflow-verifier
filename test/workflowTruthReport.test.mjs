import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatWorkflowTruthReport,
  STEP_STATUS_TRUTH_LABELS,
} from "../dist/workflowTruthReport.js";

const GOLDEN_COMPLETE = `workflow_id: wf_complete
workflow_status: complete
trust: TRUSTED: Every step matched the database under the configured verification rules.
run_level: (none)
steps:
  - seq=0 tool=crm.upsert_contact status=VERIFIED
    intended: Upsert contact "c_ok" with fields {"name":"Alice","status":"active"}`;

const GOLDEN_MISSING = `workflow_id: wf_missing
workflow_status: inconsistent
trust: NOT_TRUSTED: At least one step failed verification against the database (determinate failure).
run_level: (none)
steps:
  - seq=0 tool=crm.upsert_contact status=FAILED_ROW_MISSING
    reason: [ROW_ABSENT] No row matched key
    intended: Upsert contact "missing_id" with fields {"name":"X","status":"Y"}`;

const GOLDEN_INCOMPLETE_UNKNOWN_TOOL = `workflow_id: wf_unknown_tool
workflow_status: incomplete
trust: NOT_TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.
run_level: (none)
steps:
  - seq=0 tool=nope.tool status=INCOMPLETE_CANNOT_VERIFY
    reason: [UNKNOWN_TOOL] Unknown toolId: nope.tool
    intended: Unknown tool: nope.tool`;

const GOLDEN_MALFORMED = `workflow_id: wf_complete
workflow_status: incomplete
trust: NOT_TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.
run_level:
  - MALFORMED_EVENT_LINE: Event line was missing, invalid JSON, or failed schema validation for a tool observation.
steps:`;

const GOLDEN_EMPTY_STEPS = `workflow_id: no_such_workflow
workflow_status: incomplete
trust: NOT_TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.
run_level: (none)
steps:`;

const GOLDEN_UNKNOWN_RUN_LEVEL = `workflow_id: w
workflow_status: complete
trust: TRUSTED: Every step matched the database under the configured verification rules.
run_level:
  - UNKNOWN_CODE_X: Unknown run-level code (forward compatibility).
steps:
  - seq=0 tool=t status=VERIFIED`;

describe("formatWorkflowTruthReport", () => {
  it("golden complete / inconsistent missing / incomplete unknown tool", () => {
    const complete = {
      schemaVersion: 1,
      workflowId: "wf_complete",
      status: "complete",
      runLevelCodes: [],
      steps: [
        {
          seq: 0,
          toolId: "crm.upsert_contact",
          intendedEffect: 'Upsert contact "c_ok" with fields {"name":"Alice","status":"active"}',
          verificationRequest: {},
          status: "verified",
          reasons: [],
          evidenceSummary: {},
        },
      ],
    };
    assert.equal(formatWorkflowTruthReport(complete), GOLDEN_COMPLETE);

    const missing = {
      schemaVersion: 1,
      workflowId: "wf_missing",
      status: "inconsistent",
      runLevelCodes: [],
      steps: [
        {
          seq: 0,
          toolId: "crm.upsert_contact",
          intendedEffect: 'Upsert contact "missing_id" with fields {"name":"X","status":"Y"}',
          verificationRequest: {},
          status: "missing",
          reasons: [{ code: "ROW_ABSENT", message: "No row matched key" }],
          evidenceSummary: {},
        },
      ],
    };
    assert.equal(formatWorkflowTruthReport(missing), GOLDEN_MISSING);

    const unknownTool = {
      schemaVersion: 1,
      workflowId: "wf_unknown_tool",
      status: "incomplete",
      runLevelCodes: [],
      steps: [
        {
          seq: 0,
          toolId: "nope.tool",
          intendedEffect: "Unknown tool: nope.tool",
          verificationRequest: null,
          status: "incomplete_verification",
          reasons: [{ code: "UNKNOWN_TOOL", message: "Unknown toolId: nope.tool" }],
          evidenceSummary: {},
        },
      ],
    };
    assert.equal(formatWorkflowTruthReport(unknownTool), GOLDEN_INCOMPLETE_UNKNOWN_TOOL);
  });

  it("golden malformed run-level and empty steps", () => {
    const malformed = {
      schemaVersion: 1,
      workflowId: "wf_complete",
      status: "incomplete",
      runLevelCodes: ["MALFORMED_EVENT_LINE"],
      steps: [],
    };
    assert.equal(formatWorkflowTruthReport(malformed), GOLDEN_MALFORMED);

    const empty = {
      schemaVersion: 1,
      workflowId: "no_such_workflow",
      status: "incomplete",
      runLevelCodes: [],
      steps: [],
    };
    assert.equal(formatWorkflowTruthReport(empty), GOLDEN_EMPTY_STEPS);
  });

  it("unknown run-level code uses fallback explanation", () => {
    const r = {
      schemaVersion: 1,
      workflowId: "w",
      status: "complete",
      runLevelCodes: ["UNKNOWN_CODE_X"],
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: "",
          verificationRequest: null,
          status: "verified",
          reasons: [],
          evidenceSummary: {},
        },
      ],
    };
    assert.equal(formatWorkflowTruthReport(r), GOLDEN_UNKNOWN_RUN_LEVEL);
  });

  it("multi-step: each step line uses STEP_STATUS_TRUTH_LABELS", () => {
    const result = {
      schemaVersion: 1,
      workflowId: "multi",
      status: "inconsistent",
      runLevelCodes: [],
      steps: [
        {
          seq: 0,
          toolId: "a",
          intendedEffect: "",
          verificationRequest: null,
          status: "verified",
          reasons: [],
          evidenceSummary: {},
        },
        {
          seq: 1,
          toolId: "b",
          intendedEffect: "",
          verificationRequest: null,
          status: "missing",
          reasons: [{ code: "X", message: "y" }],
          evidenceSummary: {},
        },
        {
          seq: 2,
          toolId: "c",
          intendedEffect: "",
          verificationRequest: null,
          status: "partial",
          reasons: [{ code: "P", message: "q" }],
          evidenceSummary: {},
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

  it("all five StepStatus values appear with correct status= token", () => {
    const statuses = [
      "verified",
      "missing",
      "partial",
      "inconsistent",
      "incomplete_verification",
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
    }));
    const r = {
      schemaVersion: 1,
      workflowId: "s",
      status: "incomplete",
      runLevelCodes: [],
      steps,
    };
    const out = formatWorkflowTruthReport(r);
    for (const status of statuses) {
      assert.ok(out.includes(`status=${STEP_STATUS_TRUTH_LABELS[status]}`));
    }
  });

  it("empty reason message renders (no message)", () => {
    const r = {
      schemaVersion: 1,
      workflowId: "w",
      status: "incomplete",
      runLevelCodes: [],
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: "",
          verificationRequest: null,
          status: "incomplete_verification",
          reasons: [{ code: "C", message: "   " }],
          evidenceSummary: {},
        },
      ],
    };
    const out = formatWorkflowTruthReport(r);
    assert.ok(out.includes("reason: [C] (no message)"));
  });

  it("reason with field appends field=", () => {
    const r = {
      schemaVersion: 1,
      workflowId: "w",
      status: "incomplete",
      runLevelCodes: [],
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: "",
          verificationRequest: null,
          status: "incomplete_verification",
          reasons: [{ code: "E", message: "msg", field: "col" }],
          evidenceSummary: {},
        },
      ],
    };
    assert.ok(formatWorkflowTruthReport(r).includes("reason: [E] msg field=col"));
  });

  it("newlines in toolId sanitized", () => {
    const r = {
      schemaVersion: 1,
      workflowId: "w",
      status: "complete",
      runLevelCodes: [],
      steps: [
        {
          seq: 0,
          toolId: "bad\nid",
          intendedEffect: "",
          verificationRequest: null,
          status: "verified",
          reasons: [],
          evidenceSummary: {},
        },
      ],
    };
    assert.ok(formatWorkflowTruthReport(r).includes("tool=bad_id"));
  });

  it("intendedEffect newlines collapsed to single line", () => {
    const r = {
      schemaVersion: 1,
      workflowId: "w",
      status: "complete",
      runLevelCodes: [],
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: "line1\nline2",
          verificationRequest: null,
          status: "verified",
          reasons: [],
          evidenceSummary: {},
        },
      ],
    };
    assert.ok(formatWorkflowTruthReport(r).includes("intended: line1 line2"));
  });
});
