import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { formatWorkflowTruthReport } from "../dist/workflowTruthReport.js";
import { createEmptyVerificationRunContext } from "../dist/verificationRunContext.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "test/golden/truth-report-text");
const emptyCtx = createEmptyVerificationRunContext();
const vp = { consistencyMode: "strong", verificationWindowMs: 0, pollIntervalMs: 0 };
const PC_C_OK = '{"fields":{"name":"Alice","status":"active"},"recordId":"c_ok"}';
const PC_EMPTY = "{}";
const PC_MISSING = '{"fields":{"name":"X","status":"Y"},"recordId":"missing_id"}';
const MALFORMED_MSG =
  "Event line was missing, invalid JSON, or failed schema validation for a tool observation.";
const NO_STEPS_MSG = "No tool_observed events for this workflow id after filtering.";

const engines = {
  complete: {
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
  },
  missing: {
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
  },
  unknownTool: {
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
  },
  malformed: {
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
  },
  empty: {
    schemaVersion: 8,
    verificationRunContext: emptyCtx,
    workflowId: "no_such_workflow",
    status: "incomplete",
    runLevelReasons: [{ code: "NO_STEPS_FOR_WORKFLOW", message: NO_STEPS_MSG }],
    verificationPolicy: vp,
    eventSequenceIntegrity: { kind: "normal" },
    steps: [],
  },
  unknownRunLevel: {
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
  },
  uncertain: {
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
  },
};

import { mkdirSync } from "node:fs";
mkdirSync(outDir, { recursive: true });
for (const [name, eng] of Object.entries(engines)) {
  writeFileSync(join(outDir, `${name}.txt`), formatWorkflowTruthReport(eng));
}
for (const id of ["wf_multi_ok", "wf_multi_partial", "wf_multi_all_fail"]) {
  const p = JSON.parse(readFileSync(join(root, `test/golden/${id}.stdout.json`), "utf8"));
  writeFileSync(join(outDir, `${id}.txt`), formatWorkflowTruthReport(p));
  writeFileSync(join(root, `test/golden/${id}.stderr.txt`), formatWorkflowTruthReport(p));
}
console.log("wrote", outDir, "and test/golden/*.stderr.txt for multi workflows");
