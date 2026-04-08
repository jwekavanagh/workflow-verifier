import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatWorkflowTruthReport,
  HUMAN_REPORT_RESULT_PHRASE,
  STEP_STATUS_TRUTH_LABELS,
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

function loadTruthGolden(name) {
  return readFileSync(join(root, "test/golden/truth-report-text", `${name}.txt`), "utf8");
}

const MALFORMED_MSG =
  "Event line was missing, invalid JSON, or failed schema validation for a tool observation.";
const NO_STEPS_MSG = "No tool_observed events for this workflow id after filtering.";

describe("formatWorkflowTruthReport", () => {
  it("golden complete / inconsistent missing / incomplete unknown tool", () => {
    const complete = {
      schemaVersion: 8,
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
    assert.equal(normTruthText(formatWorkflowTruthReport(complete)), normTruthText(loadTruthGolden("complete")));

    const missing = {
      schemaVersion: 8,
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
    assert.equal(normTruthText(formatWorkflowTruthReport(missing)), normTruthText(loadTruthGolden("missing")));

    const unknownTool = {
      schemaVersion: 8,
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
      normTruthText(loadTruthGolden("unknownTool")),
    );
  });

  it("irregular event_sequence extends trust line and lists capture reason", () => {
    const captureReason = eventSequenceIssue("CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ");
    const r = {
      schemaVersion: 8,
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
    assert.ok(out.includes(`    user_meaning: ${captureReason.message}`));
    assert.ok(out.includes(`    category: workflow_execution`));
  });

  it("golden malformed run-level and empty steps", () => {
    const malformed = {
      schemaVersion: 8,
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
    assert.equal(normTruthText(formatWorkflowTruthReport(malformed)), normTruthText(loadTruthGolden("malformed")));

    const empty = {
      schemaVersion: 8,
      verificationRunContext: emptyCtx,
      workflowId: "no_such_workflow",
      status: "incomplete",
      runLevelReasons: [{ code: "NO_STEPS_FOR_WORKFLOW", message: NO_STEPS_MSG }],
      verificationPolicy: vp,
      eventSequenceIntegrity: { kind: "normal" },
      steps: [],
    };
    assert.equal(normTruthText(formatWorkflowTruthReport(empty)), normTruthText(loadTruthGolden("empty")));
  });

  it("unknown run-level code uses fallback explanation", () => {
    const r = {
      schemaVersion: 8,
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
    assert.equal(normTruthText(formatWorkflowTruthReport(r)), normTruthText(loadTruthGolden("unknownRunLevel")));
  });

  it("multi-step: each step block includes human phrase for outcome", () => {
    const result = {
      schemaVersion: 8,
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
        out.includes(`seq=${s.seq} tool=${s.toolId}`) && out.includes(phrase),
        `expected step block for seq=${s.seq}`,
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
      schemaVersion: 8,
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
    assert.equal(normTruthText(formatWorkflowTruthReport(uncertain)), normTruthText(loadTruthGolden("uncertain")));
  });

  it("all StepStatus values appear with correct human phrase in verification_verdict", () => {
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
      schemaVersion: 8,
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
      assert.ok(out.includes(HUMAN_REPORT_RESULT_PHRASE[label]));
    }
  });

  it("run-level reason message is trimmed; whitespace-only becomes (no message)", () => {
    const trimmed = {
      schemaVersion: 8,
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
    assert.ok(formatWorkflowTruthReport(trimmed).includes("user_meaning: Verification issue (code X)."));

    const blank = {
      schemaVersion: 8,
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
    assert.ok(formatWorkflowTruthReport(blank).includes("user_meaning: Verification issue (code Y)."));
  });

  it("empty reason message renders (no message)", () => {
    const r = {
      schemaVersion: 8,
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
    assert.ok(out.includes("user_meaning: Database query failed during verification."));
  });

  it("reason with field appends field=", () => {
    const r = {
      schemaVersion: 8,
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
    assert.ok(t.includes("user_meaning: Database query failed during verification."));
  });

  it("newlines in toolId sanitized", () => {
    const r = {
      schemaVersion: 8,
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

  it("intendedEffect newlines collapsed in declared line intent=", () => {
    const r = {
      schemaVersion: 8,
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
    assert.ok(formatWorkflowTruthReport(r).includes("intent=line1 line2"));
  });
});
