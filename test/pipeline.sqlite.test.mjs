import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { verifyWorkflow, withWorkflowVerification } from "../dist/pipeline.js";
import { formatWorkflowTruthReport } from "../dist/workflowTruthReport.js";
import { loadSchemaValidator } from "../dist/schemaLoad.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

describe("verifyWorkflow integration", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "etl-"));
    dbPath = join(dir, "test.db");
    const sql = readFileSync(join(root, "examples", "seed.sql"), "utf8");
    const db = new DatabaseSync(dbPath);
    db.exec(sql);
    db.close();
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const eventsPath = join(root, "examples", "events.ndjson");
  const registryPath = join(root, "examples", "tools.json");

  const noopLog = () => {};
  const sqliteDb = () => ({ kind: "sqlite", path: dbPath });

  it("wf_complete → complete", async () => {
    const r = await verifyWorkflow({
      workflowId: "wf_complete",
      eventsPath,
      registryPath,
      database: sqliteDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.equal(r.status, "complete");
    assert.equal(r.steps[0]?.status, "verified");
  });

  it("wf_missing → inconsistent / ROW_ABSENT", async () => {
    const r = await verifyWorkflow({
      workflowId: "wf_missing",
      eventsPath,
      registryPath,
      database: sqliteDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.equal(r.status, "inconsistent");
    assert.equal(r.steps[0]?.status, "missing");
    assert.equal(r.steps[0]?.reasons[0]?.code, "ROW_ABSENT");
  });

  it("wf_partial → inconsistent / VALUE_MISMATCH with expected and actual", async () => {
    const r = await verifyWorkflow({
      workflowId: "wf_partial",
      eventsPath,
      registryPath,
      database: sqliteDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.equal(r.status, "inconsistent");
    assert.equal(r.steps[0]?.status, "inconsistent");
    assert.equal(r.steps[0]?.reasons[0]?.code, "VALUE_MISMATCH");
    assert.match(r.steps[0]?.reasons[0]?.message, /^Expected .+ but found .+ for field name$/);
    assert.equal(r.steps[0]?.evidenceSummary.expected, JSON.stringify("N"));
    assert.equal(r.steps[0]?.evidenceSummary.actual, "null");
  });

  it("wf_inconsistent → inconsistent / VALUE_MISMATCH", async () => {
    const r = await verifyWorkflow({
      workflowId: "wf_inconsistent",
      eventsPath,
      registryPath,
      database: sqliteDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.equal(r.status, "inconsistent");
    assert.equal(r.steps[0]?.status, "inconsistent");
    assert.equal(r.steps[0]?.reasons[0]?.code, "VALUE_MISMATCH");
  });

  it("wf_duplicate_rows → DUPLICATE_ROWS", async () => {
    const r = await verifyWorkflow({
      workflowId: "wf_duplicate_rows",
      eventsPath,
      registryPath,
      database: sqliteDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.equal(r.status, "inconsistent");
    assert.equal(r.steps[0]?.reasons[0]?.code, "DUPLICATE_ROWS");
  });

  it("wf_unknown_tool → incomplete", async () => {
    const r = await verifyWorkflow({
      workflowId: "wf_unknown_tool",
      eventsPath,
      registryPath,
      database: sqliteDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.equal(r.status, "incomplete");
    assert.equal(r.steps[0]?.status, "incomplete_verification");
    assert.equal(r.steps[0]?.reasons[0]?.code, "UNKNOWN_TOOL");
  });

  it("wf_dup_seq → one logical step, complete, repeat metadata", async () => {
    const r = await verifyWorkflow({
      workflowId: "wf_dup_seq",
      eventsPath,
      registryPath,
      database: sqliteDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.equal(r.schemaVersion, 2);
    assert.equal(r.status, "complete");
    assert.equal(r.steps.length, 1);
    assert.equal(r.steps[0]?.status, "verified");
    assert.equal(r.steps[0]?.repeatObservationCount, 2);
    assert.equal(r.steps[0]?.evaluatedObservationOrdinal, 2);
    assert.ok(!r.runLevelCodes.includes("DUPLICATE_SEQ"));
  });

  it("wf_divergent_retry → RETRY_OBSERVATIONS_DIVERGE", async () => {
    const r = await verifyWorkflow({
      workflowId: "wf_divergent_retry",
      eventsPath,
      registryPath,
      database: sqliteDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.equal(r.status, "incomplete");
    assert.equal(r.steps.length, 1);
    assert.equal(r.steps[0]?.status, "incomplete_verification");
    assert.equal(r.steps[0]?.reasons[0]?.code, "RETRY_OBSERVATIONS_DIVERGE");
    assert.equal(r.steps[0]?.repeatObservationCount, 2);
    assert.equal(r.steps[0]?.evaluatedObservationOrdinal, 2);
  });

  it("determinism: identical JSON on repeat verifyWorkflow", async () => {
    const opts = {
      workflowId: "wf_dup_seq",
      eventsPath,
      registryPath,
      database: sqliteDb(),
      logStep: noopLog,
      truthReport: () => {},
    };
    const a = await verifyWorkflow(opts);
    const b = await verifyWorkflow(opts);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("ignores params.ok — fake success still needs row", async () => {
    const eventsFile = join(dir, "events_ok.jsonl");
    writeFileSync(
      eventsFile,
      `${JSON.stringify({
        schemaVersion: 1,
        workflowId: "wf_fake_ok",
        seq: 0,
        type: "tool_observed",
        toolId: "crm.upsert_contact",
        params: {
          ok: true,
          recordId: "nope",
          fields: { name: "x", status: "y" },
        },
      })}\n`,
    );
    const r = await verifyWorkflow({
      workflowId: "wf_fake_ok",
      eventsPath: eventsFile,
      registryPath,
      database: sqliteDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.equal(r.status, "inconsistent");
    assert.equal(r.steps[0]?.status, "missing");
  });

  it("malformed line → MALFORMED_EVENT_LINE", async () => {
    const badFile = join(dir, "bad.ndjson");
    writeFileSync(badFile, "not json\n");
    const r = await verifyWorkflow({
      workflowId: "wf_complete",
      eventsPath: badFile,
      registryPath,
      database: sqliteDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.equal(r.status, "incomplete");
    assert.deepStrictEqual(r.runLevelCodes, ["MALFORMED_EVENT_LINE", "NO_STEPS_FOR_WORKFLOW"]);
    assert.equal(r.runLevelReasons.length, 2);
  });

  it("empty workflow id filter → incomplete", async () => {
    const r = await verifyWorkflow({
      workflowId: "no_such_workflow",
      eventsPath,
      registryPath,
      database: sqliteDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.equal(r.status, "incomplete");
    assert.equal(r.steps.length, 0);
    assert.deepStrictEqual(r.runLevelCodes, ["NO_STEPS_FOR_WORKFLOW"]);
    assert.equal(r.runLevelReasons[0]?.code, "NO_STEPS_FOR_WORKFLOW");
  });

  it("truthReport receives formatWorkflowTruthReport(result) once (verifyWorkflow)", async () => {
    const received = [];
    const r = await verifyWorkflow({
      workflowId: "wf_complete",
      eventsPath,
      registryPath,
      database: sqliteDb(),
      logStep: noopLog,
      truthReport: (s) => received.push(s),
    });
    assert.equal(received.length, 1);
    assert.equal(received[0], formatWorkflowTruthReport(r));
  });

  it("truthReport receives formatWorkflowTruthReport(result) once (withWorkflowVerification)", async () => {
    let ev;
    for (const line of readFileSync(eventsPath, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0)) {
      const o = JSON.parse(line);
      if (o.workflowId === "wf_complete") {
        ev = o;
        break;
      }
    }
    assert.ok(ev);
    const received = [];
    const r = await withWorkflowVerification(
      {
        workflowId: "wf_complete",
        registryPath,
        dbPath,
        logStep: noopLog,
        truthReport: (s) => received.push(s),
      },
      async (observeStep) => {
        observeStep(ev);
      },
    );
    assert.equal(received.length, 1);
    assert.equal(received[0], formatWorkflowTruthReport(r));
  });
});

function normTruthText(s) {
  return s.replace(/\r\n/g, "\n").trimEnd();
}

describe("multi-effect verification (golden stdout, stderr, AJV)", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "etl-multi-"));
    dbPath = join(dir, "test.db");
    const db = new DatabaseSync(dbPath);
    db.exec(readFileSync(join(root, "examples", "seed.sql"), "utf8"));
    db.close();
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const eventsMulti = join(root, "test/fixtures/multi-effect/events.ndjson");
  const registryMulti = join(root, "test/fixtures/multi-effect/tools.json");
  const goldenDir = join(root, "test/golden");
  const noopLog = () => {};
  const sqliteDb = () => ({ kind: "sqlite", path: dbPath });
  const validateResult = loadSchemaValidator("workflow-result");

  for (const wfId of ["wf_multi_ok", "wf_multi_partial", "wf_multi_all_fail"]) {
    it(`${wfId} matches golden stdout, stderr, and workflow-result schema`, async () => {
      const expectedObj = JSON.parse(readFileSync(join(goldenDir, `${wfId}.stdout.json`), "utf8"));
      const expectedErr = normTruthText(readFileSync(join(goldenDir, `${wfId}.stderr.txt`), "utf8"));
      const r = await verifyWorkflow({
        workflowId: wfId,
        eventsPath: eventsMulti,
        registryPath: registryMulti,
        database: sqliteDb(),
        logStep: noopLog,
        truthReport: () => {},
      });
      assert.deepStrictEqual(r, expectedObj);
      assert.equal(normTruthText(formatWorkflowTruthReport(r)), expectedErr);
      if (!validateResult(r)) {
        assert.fail(JSON.stringify(validateResult.errors ?? []));
      }
    });
  }
});
