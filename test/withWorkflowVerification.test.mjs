/**
 * Wrapper integration tests — AJV via dist/schemaLoad.js (same path as plan).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as api from "../dist/index.js";
import { CLI_OPERATIONAL_CODES } from "../dist/failureCatalog.js";
import { verifyWorkflow, withWorkflowVerification } from "../dist/pipeline.js";
import { TruthLayerError } from "../dist/truthLayerError.js";
import { loadSchemaValidator } from "../dist/schemaLoad.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function eventsForWorkflow(eventsPath, workflowId) {
  const lines = readFileSync(eventsPath, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out = [];
  for (const line of lines) {
    const ev = JSON.parse(line);
    if (ev.workflowId === workflowId) {
      out.push(ev);
    }
  }
  return out;
}

describe("withWorkflowVerification", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "etl-wfv-"));
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

  it("public export surface", () => {
    assert.equal(Object.hasOwn(api, "withWorkflowVerification"), true);
    assert.equal(typeof api.withWorkflowVerification, "function");
    assert.equal(Object.hasOwn(api, "formatWorkflowTruthReport"), true);
    assert.equal(typeof api.formatWorkflowTruthReport, "function");
    assert.equal(Object.hasOwn(api, "STEP_STATUS_TRUTH_LABELS"), true);
    assert.equal(api.STEP_STATUS_TRUTH_LABELS.verified, "VERIFIED");
    assert.equal(Object.hasOwn(api, "createWorkflowVerificationSession"), false);
    assert.equal(Object.hasOwn(api, "finish"), false);
  });

  it("eventual verificationPolicy rejects before run", async () => {
    await assert.rejects(
      withWorkflowVerification(
        {
          workflowId: "wf_complete",
          registryPath,
          dbPath,
          logStep: noopLog,
          truthReport: () => {},
          verificationPolicy: {
            consistencyMode: "eventual",
            verificationWindowMs: 100,
            pollIntervalMs: 50,
          },
        },
        async () => {},
      ),
      (e) =>
        e instanceof TruthLayerError &&
        e.code === CLI_OPERATIONAL_CODES.EVENTUAL_MODE_NOT_SUPPORTED_IN_PROCESS_HOOK,
    );
  });

  it("parity wf_complete wf_missing wf_dup_seq wf_divergent_retry vs verifyWorkflow", async () => {
    for (const wf of ["wf_complete", "wf_missing", "wf_dup_seq", "wf_divergent_retry"]) {
      const events = eventsForWorkflow(eventsPath, wf);
      const batchResult = await verifyWorkflow({
        workflowId: wf,
        eventsPath,
        registryPath,
        database: { kind: "sqlite", path: dbPath },
        logStep: noopLog,
        truthReport: () => {},
      });
      const wrapperResult = await withWorkflowVerification(
        { workflowId: wf, registryPath, dbPath, logStep: noopLog, truthReport: () => {} },
        async (observeStep) => {
          for (const ev of events) {
            observeStep(ev);
          }
        },
      );
      assert.deepStrictEqual(wrapperResult, batchResult);
    }
  });

  it("out-of-order observeStep matches verifyWorkflow on same capture-ordered NDJSON", async () => {
    const evLate = {
      schemaVersion: 1,
      workflowId: "wf_wrap_order",
      seq: 1,
      type: "tool_observed",
      toolId: "crm.upsert_contact",
      params: { recordId: "c_bad", fields: { name: "Bob", status: "active" } },
    };
    const evFirst = {
      schemaVersion: 1,
      workflowId: "wf_wrap_order",
      seq: 0,
      type: "tool_observed",
      toolId: "crm.upsert_contact",
      params: { recordId: "c_ok", fields: { name: "Alice", status: "active" } },
    };
    const nd = join(dir, "wrap_order.ndjson");
    writeFileSync(nd, `${JSON.stringify(evLate)}\n${JSON.stringify(evFirst)}\n`);
    const batchResult = await verifyWorkflow({
      workflowId: "wf_wrap_order",
      eventsPath: nd,
      registryPath,
      database: { kind: "sqlite", path: dbPath },
      logStep: noopLog,
      truthReport: () => {},
    });
    const wrapperResult = await withWorkflowVerification(
      { workflowId: "wf_wrap_order", registryPath, dbPath, logStep: noopLog, truthReport: () => {} },
      async (observeStep) => {
        observeStep(evLate);
        observeStep(evFirst);
      },
    );
    assert.deepStrictEqual(wrapperResult, batchResult);
    assert.equal(wrapperResult.eventSequenceIntegrity.kind, "irregular");
  });

  it("non-object observeStep → MALFORMED_EVENT_LINE, incomplete, no steps", async () => {
    const result = await withWorkflowVerification(
      { workflowId: "wf_complete", registryPath, dbPath, logStep: noopLog, truthReport: () => {} },
      async (observeStep) => {
        observeStep("not-json-line");
      },
    );
    assert.equal(result.status, "incomplete");
    assert.ok(result.runLevelCodes.includes("MALFORMED_EVENT_LINE"));
    assert.equal(result.steps.length, 0);
  });

  it("invalid object observeStep → MALFORMED_EVENT_LINE", async () => {
    const result = await withWorkflowVerification(
      { workflowId: "wf_complete", registryPath, dbPath, logStep: noopLog, truthReport: () => {} },
      async (observeStep) => {
        observeStep({});
      },
    );
    assert.equal(result.status, "incomplete");
    assert.ok(result.runLevelCodes.includes("MALFORMED_EVENT_LINE"));
    assert.equal(result.steps.length, 0);
  });

  it("wrong workflowId on event is skipped", async () => {
    const good = eventsForWorkflow(eventsPath, "wf_complete")[0];
    const other = eventsForWorkflow(eventsPath, "wf_missing")[0];
    const result = await withWorkflowVerification(
      { workflowId: "wf_complete", registryPath, dbPath, logStep: noopLog, truthReport: () => {} },
      async (observeStep) => {
        observeStep(other);
        observeStep(good);
      },
    );
    const batchResult = await verifyWorkflow({
      workflowId: "wf_complete",
      eventsPath,
      registryPath,
      database: { kind: "sqlite", path: dbPath },
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.deepStrictEqual(result, batchResult);
  });

  it("duplicate seq matches batch wf_dup_seq", async () => {
    const events = eventsForWorkflow(eventsPath, "wf_dup_seq");
    assert.equal(events.length, 2);
    const batchResult = await verifyWorkflow({
      workflowId: "wf_dup_seq",
      eventsPath,
      registryPath,
      database: { kind: "sqlite", path: dbPath },
      logStep: noopLog,
      truthReport: () => {},
    });
    const result = await withWorkflowVerification(
      { workflowId: "wf_dup_seq", registryPath, dbPath, logStep: noopLog, truthReport: () => {} },
      async (observeStep) => {
        assert.equal(observeStep(events[0]), undefined);
        assert.equal(observeStep(events[1]), undefined);
      },
    );
    assert.deepStrictEqual(result, batchResult);
    assert.equal(result.status, "complete");
    assert.equal(result.steps.length, 1);
  });

  it("run throws: same error reference and DB reopen SELECT 1 succeeds", async () => {
    const err = new Error("intentional-run-fail");
    const ev = eventsForWorkflow(eventsPath, "wf_complete")[0];
    await assert.rejects(
      withWorkflowVerification(
        { workflowId: "wf_complete", registryPath, dbPath, logStep: noopLog, truthReport: () => {} },
        async (observeStep) => {
          observeStep(ev);
          throw err;
        },
      ),
      (e) => e === err,
    );
    const db2 = new DatabaseSync(dbPath, { readOnly: true });
    const row = db2.prepare("SELECT 1 AS ok").get();
    assert.ok(row);
    db2.close();
  });

  it("observeStep after run completes throws fixed message", async () => {
    let stash;
    const ev = eventsForWorkflow(eventsPath, "wf_complete")[0];
    await withWorkflowVerification(
      { workflowId: "wf_complete", registryPath, dbPath, logStep: noopLog, truthReport: () => {} },
      async (observeStep) => {
        stash = observeStep;
        observeStep(ev);
      },
    );
    assert.throws(
      () => stash(ev),
      (e) =>
        e instanceof Error &&
        e.message === "Workflow verification observeStep invoked after workflow run completed",
    );
  });

  it("success path WorkflowResult validates workflow-result schema", async () => {
    const ev = eventsForWorkflow(eventsPath, "wf_complete")[0];
    const result = await withWorkflowVerification(
      { workflowId: "wf_complete", registryPath, dbPath, logStep: noopLog, truthReport: () => {} },
      async (observeStep) => {
        observeStep(ev);
      },
    );
    const validateResult = loadSchemaValidator("workflow-result");
    assert.equal(validateResult(result), true);
  });
});
