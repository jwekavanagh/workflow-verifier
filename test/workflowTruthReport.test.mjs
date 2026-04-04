import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatWorkflowTruthReport,
  HUMAN_REPORT_RESULT_PHRASE,
  STEP_STATUS_TRUTH_LABELS,
  TRUST_LINE_UNCERTAIN_WITHIN_WINDOW,
  TRUST_LINE_EVENT_SEQUENCE_IRREGULAR_SUFFIX,
} from "../dist/workflowTruthReport.js";
import { eventSequenceIssue } from "../dist/failureCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const vp = {
  consistencyMode: "strong",
  verificationWindowMs: 0,
  pollIntervalMs: 0,
};

function normTruthText(s) {
  return s.replace(/\r\n/g, "\n").trimEnd();
}

const GOLDEN_COMPLETE = `workflow_id: wf_complete
workflow_status: complete
trust: TRUSTED: Every step matched the database under the configured verification rules.
run_level: (none)
event_sequence: normal
steps:
  - seq=0 tool=crm.upsert_contact result=Matched the database.
    observations: evaluated=1 of 1 in_capture_order
    intended: Upsert contact "c_ok" with fields {"name":"Alice","status":"active"}`;

const GOLDEN_MISSING = `workflow_id: wf_missing
workflow_status: inconsistent
trust: NOT TRUSTED: At least one step failed verification against the database (determinate failure).
run_level: (none)
event_sequence: normal
steps:
  - seq=0 tool=crm.upsert_contact result=Expected row is missing from the database (the log implies a write that is not present).
    observations: evaluated=1 of 1 in_capture_order
    category: workflow_execution
    detail: No row matched key
    reference_code: ROW_ABSENT
    intended: Upsert contact "missing_id" with fields {"name":"X","status":"Y"}`;

const GOLDEN_INCOMPLETE_UNKNOWN_TOOL = `workflow_id: wf_unknown_tool
workflow_status: incomplete
trust: NOT TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.
run_level: (none)
event_sequence: normal
steps:
  - seq=0 tool=nope.tool result=This step could not be fully verified (registry, connector, or data shape issue).
    observations: evaluated=1 of 1 in_capture_order
    category: verification_setup
    detail: Unknown toolId: nope.tool
    reference_code: UNKNOWN_TOOL
    intended: Unknown tool: nope.tool`;

const MALFORMED_MSG =
  "Event line was missing, invalid JSON, or failed schema validation for a tool observation.";
const NO_STEPS_MSG = "No tool_observed events for this workflow id after filtering.";

const GOLDEN_MALFORMED = `workflow_id: wf_complete
workflow_status: incomplete
trust: NOT TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.
run_level:
  - detail: ${MALFORMED_MSG}
    category: workflow_execution
    reference_code: MALFORMED_EVENT_LINE
  - detail: ${NO_STEPS_MSG}
    category: workflow_execution
    reference_code: NO_STEPS_FOR_WORKFLOW
event_sequence: normal
steps:`;

const GOLDEN_EMPTY_STEPS = `workflow_id: no_such_workflow
workflow_status: incomplete
trust: NOT TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.
run_level:
  - detail: ${NO_STEPS_MSG}
    category: workflow_execution
    reference_code: NO_STEPS_FOR_WORKFLOW
event_sequence: normal
steps:`;

const GOLDEN_UNKNOWN_RUN_LEVEL = `workflow_id: w
workflow_status: complete
trust: TRUSTED: Every step matched the database under the configured verification rules.
run_level:
  - detail: Unknown run-level code (forward compatibility).
    category: workflow_execution
    reference_code: UNKNOWN_CODE_X
event_sequence: normal
steps:
  - seq=0 tool=t result=Matched the database.
    observations: evaluated=1 of 1 in_capture_order`;

const GOLDEN_UNCERTAIN_TRUST = `workflow_id: wf_uncertain
workflow_status: incomplete
trust: ${TRUST_LINE_UNCERTAIN_WITHIN_WINDOW}
run_level: (none)
event_sequence: normal
steps:
  - seq=0 tool=t result=The expected row did not appear within the verification window.
    observations: evaluated=1 of 1 in_capture_order
    category: observation_uncertainty
    detail: No row within window
    reference_code: ROW_NOT_OBSERVED_WITHIN_WINDOW`;

describe("formatWorkflowTruthReport", () => {
  it("golden complete / inconsistent missing / incomplete unknown tool", () => {
    const complete = {
      schemaVersion: 5,
      workflowId: "wf_complete",
      status: "complete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
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
    assert.equal(normTruthText(formatWorkflowTruthReport(complete)), normTruthText(GOLDEN_COMPLETE));

    const missing = {
      schemaVersion: 5,
      workflowId: "wf_missing",
      status: "inconsistent",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
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
    assert.equal(normTruthText(formatWorkflowTruthReport(missing)), normTruthText(GOLDEN_MISSING));

    const unknownTool = {
      schemaVersion: 5,
      workflowId: "wf_unknown_tool",
      status: "incomplete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
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
    assert.equal(
      normTruthText(formatWorkflowTruthReport(unknownTool)),
      normTruthText(GOLDEN_INCOMPLETE_UNKNOWN_TOOL),
    );
  });

  it("irregular event_sequence extends trust line and lists capture reason", () => {
    const captureReason = eventSequenceIssue("CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ");
    const r = {
      schemaVersion: 5,
      workflowId: "w",
      status: "complete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: {
        kind: "irregular",
        reasons: [captureReason],
      },
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
    const out = normTruthText(formatWorkflowTruthReport(r));
    const baseTrust =
      "TRUSTED: Every step matched the database under the configured verification rules.";
    assert.ok(
      out.startsWith(
        normTruthText(
          `workflow_id: w\nworkflow_status: complete\ntrust: ${baseTrust} ${TRUST_LINE_EVENT_SEQUENCE_IRREGULAR_SUFFIX}\n`,
        ),
      ),
    );
    assert.ok(out.includes("event_sequence: irregular\n"));
    assert.ok(out.includes(`  - detail: ${captureReason.message}`));
    assert.ok(out.includes(`    reference_code: ${captureReason.code}`));
    assert.ok(out.includes(`    category: workflow_execution`));
  });

  it("golden malformed run-level and empty steps", () => {
    const malformed = {
      schemaVersion: 5,
      workflowId: "wf_complete",
      status: "incomplete",
      runLevelCodes: ["MALFORMED_EVENT_LINE", "NO_STEPS_FOR_WORKFLOW"],
      runLevelReasons: [
        { code: "MALFORMED_EVENT_LINE", message: MALFORMED_MSG },
        { code: "NO_STEPS_FOR_WORKFLOW", message: NO_STEPS_MSG },
      ],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [],
    };
    assert.equal(normTruthText(formatWorkflowTruthReport(malformed)), normTruthText(GOLDEN_MALFORMED));

    const empty = {
      schemaVersion: 5,
      workflowId: "no_such_workflow",
      status: "incomplete",
      runLevelCodes: ["NO_STEPS_FOR_WORKFLOW"],
      runLevelReasons: [{ code: "NO_STEPS_FOR_WORKFLOW", message: NO_STEPS_MSG }],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [],
    };
    assert.equal(normTruthText(formatWorkflowTruthReport(empty)), normTruthText(GOLDEN_EMPTY_STEPS));
  });

  it("unknown run-level code uses fallback explanation", () => {
    const r = {
      schemaVersion: 5,
      workflowId: "w",
      status: "complete",
      runLevelCodes: ["UNKNOWN_CODE_X"],
      runLevelReasons: [
        { code: "UNKNOWN_CODE_X", message: "Unknown run-level code (forward compatibility)." },
      ],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
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
    assert.equal(normTruthText(formatWorkflowTruthReport(r)), normTruthText(GOLDEN_UNKNOWN_RUN_LEVEL));
  });

  it("multi-step: each step line uses HUMAN_REPORT_RESULT_PHRASE for result=", () => {
    const result = {
      schemaVersion: 5,
      workflowId: "multi",
      status: "inconsistent",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
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
      const phrase = HUMAN_REPORT_RESULT_PHRASE[label];
      assert.ok(
        out.includes(`seq=${s.seq} tool=${s.toolId} result=${phrase}`),
        `expected step line for seq=${s.seq}`,
      );
    }
  });

  it("golden wf_multi_partial stderr matches formatWorkflowTruthReport(stdout artifact)", () => {
    const stdoutPath = join(root, "test/golden/wf_multi_partial.stdout.json");
    const stderrPath = join(root, "test/golden/wf_multi_partial.stderr.txt");
    const result = JSON.parse(readFileSync(stdoutPath, "utf8"));
    const expected = normTruthText(readFileSync(stderrPath, "utf8"));
    assert.equal(normTruthText(formatWorkflowTruthReport(result)), normTruthText(expected));
  });

  it("uncertain-only step uses dedicated trust line and label", () => {
    const uncertain = {
      schemaVersion: 5,
      workflowId: "wf_uncertain",
      status: "incomplete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: "",
          verificationRequest: null,
          status: "uncertain",
          reasons: [{ code: "ROW_NOT_OBSERVED_WITHIN_WINDOW", message: "No row within window" }],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    assert.equal(normTruthText(formatWorkflowTruthReport(uncertain)), normTruthText(GOLDEN_UNCERTAIN_TRUST));
  });

  it("all StepStatus values appear with correct result= phrase", () => {
    const statuses = [
      "verified",
      "missing",
      "inconsistent",
      "incomplete_verification",
      "partially_verified",
      "uncertain",
    ];
    let seq = 0;
    const reasonFor = (status) => {
      if (status === "verified") return [];
      if (status === "missing") return [{ code: "ROW_ABSENT", message: "m" }];
      if (status === "inconsistent") return [{ code: "VALUE_MISMATCH", message: "m" }];
      if (status === "incomplete_verification") return [{ code: "CONNECTOR_ERROR", message: "m" }];
      if (status === "partially_verified") return [{ code: "MULTI_EFFECT_PARTIAL", message: "m" }];
      if (status === "uncertain") return [{ code: "ROW_NOT_OBSERVED_WITHIN_WINDOW", message: "m" }];
      return [];
    };
    const steps = statuses.map((status) => ({
      seq: seq++,
      toolId: "t",
      intendedEffect: "",
      verificationRequest: null,
      status,
      reasons: reasonFor(status),
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
    }));
    const r = {
      schemaVersion: 5,
      workflowId: "s",
      status: "incomplete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps,
    };
    const out = formatWorkflowTruthReport(r);
    for (const status of statuses) {
      const label = STEP_STATUS_TRUTH_LABELS[status];
      assert.ok(out.includes(`result=${HUMAN_REPORT_RESULT_PHRASE[label]}`));
    }
  });

  it("run-level reason message is trimmed; whitespace-only becomes (no message)", () => {
    const trimmed = {
      schemaVersion: 5,
      workflowId: "w",
      status: "complete",
      runLevelCodes: ["X"],
      runLevelReasons: [{ code: "X", message: "  hello  " }],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [],
    };
    assert.ok(formatWorkflowTruthReport(trimmed).includes("  - detail: hello"));
    assert.ok(formatWorkflowTruthReport(trimmed).includes("reference_code: X"));

    const blank = {
      schemaVersion: 5,
      workflowId: "w",
      status: "complete",
      runLevelCodes: ["Y"],
      runLevelReasons: [{ code: "Y", message: "   \t  " }],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [],
    };
    assert.ok(formatWorkflowTruthReport(blank).includes("  - detail: (no message)"));
    assert.ok(formatWorkflowTruthReport(blank).includes("reference_code: Y"));
  });

  it("empty reason message renders (no message)", () => {
    const r = {
      schemaVersion: 5,
      workflowId: "w",
      status: "incomplete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: "",
          verificationRequest: null,
          status: "incomplete_verification",
          reasons: [{ code: "CONNECTOR_ERROR", message: "   " }],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    const out = formatWorkflowTruthReport(r);
    assert.ok(out.includes("detail: (no message)"));
    assert.ok(out.includes("reference_code: CONNECTOR_ERROR"));
  });

  it("reason with field appends field=", () => {
    const r = {
      schemaVersion: 5,
      workflowId: "w",
      status: "incomplete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: "",
          verificationRequest: null,
          status: "incomplete_verification",
          reasons: [{ code: "CONNECTOR_ERROR", message: "msg", field: "col" }],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    const t = formatWorkflowTruthReport(r);
    assert.ok(t.includes("detail: msg field=col"));
    assert.ok(t.includes("reference_code: CONNECTOR_ERROR"));
  });

  it("newlines in toolId sanitized", () => {
    const r = {
      schemaVersion: 5,
      workflowId: "w",
      status: "complete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
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
      schemaVersion: 5,
      workflowId: "w",
      status: "complete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
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
