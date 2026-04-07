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
import { createEmptyVerificationRunContext } from "../dist/verificationRunContext.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const emptyCtx = createEmptyVerificationRunContext();

const vp = {
  consistencyMode: "strong",
  verificationWindowMs: 0,
  pollIntervalMs: 0,
};

/** Canonical digests for golden steps (matches `canonicalJsonForParams` on tool_observed.params). */
const PC_EMPTY = "{}";
const PC_C_OK = '{"fields":{"name":"Alice","status":"active"},"recordId":"c_ok"}';
const PC_MISSING = '{"fields":{"name":"X","status":"Y"},"recordId":"missing_id"}';

function normTruthText(s) {
  return s.replace(/\r\n/g, "\n").trimEnd();
}

const GOLDEN_COMPLETE = `workflow_id: wf_complete
workflow_status: complete
trust: TRUSTED: Every step matched the database under the configured verification rules.
execution_path: Full upstream execution-path visibility requires schemaVersion 2 run events (retrieval, model_turn, control, tool_skipped) with run graph fields.
run_level: (none)
event_sequence: normal
steps:
  - seq=0 tool=crm.upsert_contact result=Matched the database.
    observations: evaluated=1 of 1 in_capture_order
    observed_execution: ${PC_C_OK}
    intended: Upsert contact "c_ok" with fields {"name":"Alice","status":"active"}`;

const GOLDEN_MISSING = `workflow_id: wf_missing
workflow_status: inconsistent
trust: NOT TRUSTED: At least one step failed verification against the database (determinate failure).
execution_path: Full upstream execution-path visibility requires schemaVersion 2 run events (retrieval, model_turn, control, tool_skipped) with run graph fields.
diagnosis:
  summary: Primary failure at seq 0 tool crm.upsert_contact (code ROW_ABSENT); origin: downstream_system_state.
  primary_origin: downstream_system_state
  confidence: medium
  actionable_failure: category=ambiguous severity=high recommended_action=manual_review automation_safe=false
  - evidence: scope=step codes=ROW_ABSENT seq=0 tool=crm.upsert_contact
  alternative_origin: downstream_system_state
    rationale: The database has no row at the verified key; the tool log may not have committed a write, or replication lag prevented observation.
  alternative_origin: tool_use
    rationale: The database has no row at the verified key; the registry key/value or pointer resolution from tool params may not match the row that was written.
run_level: (none)
event_sequence: normal
steps:
  - seq=0 tool=crm.upsert_contact result=Expected row is missing from the database (the log implies a write that is not present).
    observations: evaluated=1 of 1 in_capture_order
    observed_execution: ${PC_MISSING}
    intended: Upsert contact "missing_id" with fields {"name":"X","status":"Y"}
    category: workflow_execution
    detail: No row matched key
    reference_code: ROW_ABSENT`;

const GOLDEN_INCOMPLETE_UNKNOWN_TOOL = `workflow_id: wf_unknown_tool
workflow_status: incomplete
trust: NOT TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.
execution_path: execution_path_concerns=1; codes=ACTION_INPUT_RESOLUTION_FAILED
  - path_finding: code=ACTION_INPUT_RESOLUTION_FAILED severity=high concern=action_inputs_invalid scope=step codes=UNKNOWN_TOOL seq=0 tool=nope.tool
    detail: Tool nope.tool at seq 0: parameter/registry resolution failed (UNKNOWN_TOOL).
diagnosis:
  summary: Primary failure at seq 0 tool nope.tool (code UNKNOWN_TOOL); origin: tool_use.
  primary_origin: tool_use
  confidence: high
  actionable_failure: category=bad_input severity=medium recommended_action=correct_verification_inputs automation_safe=false
  - evidence: scope=step codes=UNKNOWN_TOOL seq=0 tool=nope.tool
run_level: (none)
event_sequence: normal
steps:
  - seq=0 tool=nope.tool result=This step could not be fully verified (registry, connector, or data shape issue).
    observations: evaluated=1 of 1 in_capture_order
    observed_execution: ${PC_EMPTY}
    intended: Unknown tool: nope.tool
    category: verification_setup
    detail: Unknown toolId: nope.tool
    reference_code: UNKNOWN_TOOL`;

const MALFORMED_MSG =
  "Event line was missing, invalid JSON, or failed schema validation for a tool observation.";
const NO_STEPS_MSG = "No tool_observed events for this workflow id after filtering.";

const GOLDEN_MALFORMED = `workflow_id: wf_complete
workflow_status: incomplete
trust: NOT TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.
execution_path: execution_path_concerns=1; codes=RUN_LEVEL_INGEST_ISSUES
  - path_finding: code=RUN_LEVEL_INGEST_ISSUES severity=high concern=capture_integrity scope=run_level codes=MALFORMED_EVENT_LINE,NO_STEPS_FOR_WORKFLOW
    detail: Run-level ingest or parse issues (MALFORMED_EVENT_LINE, NO_STEPS_FOR_WORKFLOW).
diagnosis:
  summary: Run-level ingest or planning issue (MALFORMED_EVENT_LINE, NO_STEPS_FOR_WORKFLOW); origin: inputs.
  primary_origin: inputs
  confidence: medium
  actionable_failure: category=bad_input severity=medium recommended_action=fix_event_ingest_and_steps automation_safe=false
  - evidence: scope=run_level codes=MALFORMED_EVENT_LINE,NO_STEPS_FOR_WORKFLOW
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
execution_path: execution_path_concerns=1; codes=RUN_LEVEL_INGEST_ISSUES
  - path_finding: code=RUN_LEVEL_INGEST_ISSUES severity=high concern=capture_integrity scope=run_level codes=NO_STEPS_FOR_WORKFLOW
    detail: Run-level ingest or parse issues (NO_STEPS_FOR_WORKFLOW).
diagnosis:
  summary: Run-level ingest or planning issue (NO_STEPS_FOR_WORKFLOW); origin: workflow_flow.
  primary_origin: workflow_flow
  confidence: high
  actionable_failure: category=control_flow_problem severity=medium recommended_action=fix_event_ingest_and_steps automation_safe=false
  - evidence: scope=run_level codes=NO_STEPS_FOR_WORKFLOW
run_level:
  - detail: ${NO_STEPS_MSG}
    category: workflow_execution
    reference_code: NO_STEPS_FOR_WORKFLOW
event_sequence: normal
steps:`;

const GOLDEN_UNKNOWN_RUN_LEVEL = `workflow_id: w
workflow_status: complete
trust: TRUSTED: Every step matched the database under the configured verification rules.
execution_path: execution_path_concerns=1; codes=RUN_LEVEL_INGEST_ISSUES
  - path_finding: code=RUN_LEVEL_INGEST_ISSUES severity=high concern=capture_integrity scope=run_level codes=UNKNOWN_CODE_X
    detail: Run-level ingest or parse issues (UNKNOWN_CODE_X).
run_level:
  - detail: Unknown run-level code (forward compatibility).
    category: workflow_execution
    reference_code: UNKNOWN_CODE_X
event_sequence: normal
steps:
  - seq=0 tool=t result=Matched the database.
    observations: evaluated=1 of 1 in_capture_order
    observed_execution: ${PC_EMPTY}`;

const GOLDEN_UNCERTAIN_TRUST = `workflow_id: wf_uncertain
workflow_status: incomplete
trust: ${TRUST_LINE_UNCERTAIN_WITHIN_WINDOW}
execution_path: Full upstream execution-path visibility requires schemaVersion 2 run events (retrieval, model_turn, control, tool_skipped) with run graph fields.
diagnosis:
  summary: Primary failure at seq 0 tool t (code ROW_NOT_OBSERVED_WITHIN_WINDOW); origin: downstream_system_state.
  primary_origin: downstream_system_state
  confidence: high
  actionable_failure: category=downstream_execution_failure severity=medium recommended_action=improve_read_connectivity automation_safe=false
  - evidence: scope=step codes=ROW_NOT_OBSERVED_WITHIN_WINDOW seq=0 tool=t
run_level: (none)
event_sequence: normal
steps:
  - seq=0 tool=t result=The expected row did not appear within the verification window.
    observations: evaluated=1 of 1 in_capture_order
    observed_execution: ${PC_EMPTY}
    category: observation_uncertainty
    detail: No row within window
    reference_code: ROW_NOT_OBSERVED_WITHIN_WINDOW`;

describe("formatWorkflowTruthReport", () => {
  it("golden complete / inconsistent missing / incomplete unknown tool", () => {
    const complete = {
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "wf_complete",
      status: "complete",
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "crm.upsert_contact",
          intendedEffect: { narrative: 'Upsert contact "c_ok" with fields {"name":"Alice","status":"active"}' },
          observedExecution: { paramsCanonical: PC_C_OK },
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
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "wf_missing",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "crm.upsert_contact",
          intendedEffect: { narrative: 'Upsert contact "missing_id" with fields {"name":"X","status":"Y"}' },
          observedExecution: { paramsCanonical: PC_MISSING },
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
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "wf_unknown_tool",
      status: "incomplete",
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "nope.tool",
          intendedEffect: { narrative: "Unknown tool: nope.tool" },
          observedExecution: { paramsCanonical: PC_EMPTY },
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
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "w",
      status: "complete",
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
          intendedEffect: { narrative: "" },
          observedExecution: { paramsCanonical: PC_EMPTY },
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
      out.includes(`trust: ${baseTrust} ${TRUST_LINE_EVENT_SEQUENCE_IRREGULAR_SUFFIX}`),
    );
    assert.ok(out.includes("EVENT_SEQUENCE_IRREGULAR"));
    assert.ok(out.includes("event_sequence: irregular\n"));
    assert.ok(out.includes(`  - detail: ${captureReason.message}`));
    assert.ok(out.includes(`    reference_code: ${captureReason.code}`));
    assert.ok(out.includes(`    category: workflow_execution`));
  });

  it("golden malformed run-level and empty steps", () => {
    const malformed = {
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "wf_complete",
      status: "incomplete",
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
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "no_such_workflow",
      status: "incomplete",
      runLevelReasons: [{ code: "NO_STEPS_FOR_WORKFLOW", message: NO_STEPS_MSG }],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [],
    };
    assert.equal(normTruthText(formatWorkflowTruthReport(empty)), normTruthText(GOLDEN_EMPTY_STEPS));
  });

  it("unknown run-level code uses fallback explanation", () => {
    const r = {
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "w",
      status: "complete",
      runLevelReasons: [
        { code: "UNKNOWN_CODE_X", message: "Unknown run-level code (forward compatibility)." },
      ],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: { narrative: "" },
          observedExecution: { paramsCanonical: PC_EMPTY },
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
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "multi",
      status: "inconsistent",
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "a",
          intendedEffect: { narrative: "" },
          observedExecution: { paramsCanonical: PC_EMPTY },
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
          intendedEffect: { narrative: "" },
          observedExecution: { paramsCanonical: PC_EMPTY },
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
          intendedEffect: { narrative: "" },
          observedExecution: { paramsCanonical: PC_EMPTY },
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
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "wf_uncertain",
      status: "incomplete",
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: { narrative: "" },
          observedExecution: { paramsCanonical: PC_EMPTY },
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
      intendedEffect: { narrative: "" },
      observedExecution: { paramsCanonical: PC_EMPTY },
      verificationRequest: null,
      status,
      reasons: reasonFor(status),
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
    }));
    const r = {
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "s",
      status: "incomplete",
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
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "w",
      status: "complete",
      runLevelReasons: [{ code: "X", message: "  hello  " }],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [],
    };
    assert.ok(formatWorkflowTruthReport(trimmed).includes("  - detail: hello"));
    assert.ok(formatWorkflowTruthReport(trimmed).includes("reference_code: X"));

    const blank = {
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "w",
      status: "complete",
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
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "w",
      status: "incomplete",
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: { narrative: "" },
          observedExecution: { paramsCanonical: PC_EMPTY },
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
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "w",
      status: "incomplete",
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: { narrative: "" },
          observedExecution: { paramsCanonical: PC_EMPTY },
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
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "w",
      status: "complete",
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "bad\nid",
          intendedEffect: { narrative: "" },
          observedExecution: { paramsCanonical: PC_EMPTY },
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
      schemaVersion: 7,
      verificationRunContext: emptyCtx,
      workflowId: "w",
      status: "complete",
      runLevelReasons: [],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: { narrative: "line1\nline2" },
          observedExecution: { paramsCanonical: PC_EMPTY },
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
