import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { formatWorkflowTruthReport } from "../dist/workflowTruthReport.js";
import { createEmptyVerificationRunContext } from "../dist/verificationRunContext.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const emptyCtx = createEmptyVerificationRunContext();
const vp = { consistencyMode: "strong", verificationWindowMs: 0, pollIntervalMs: 0 };
const PC_C_OK = '{"fields":{"name":"Alice","status":"active"},"recordId":"c_ok"}';
const PC_EMPTY = "{}";
const PC_MISSING = '{"fields":{"name":"X","status":"Y"},"recordId":"missing_id"}';

const cases = {
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
};

for (const [k, v] of Object.entries(cases)) {
  writeFileSync(join(root, `scripts/_out-${k}.txt`), formatWorkflowTruthReport(v));
  console.log("wrote", k);
}

const partialPath = join(root, "test/golden/wf_multi_partial.stdout.json");
const partial = JSON.parse(readFileSync(partialPath, "utf8"));
writeFileSync(join(root, "scripts/_out-partial.txt"), formatWorkflowTruthReport(partial));
