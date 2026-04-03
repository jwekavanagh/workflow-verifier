import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { verifyWorkflow } from "../dist/pipeline.js";

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

  it("wf_complete → complete", () => {
    const r = verifyWorkflow({
      workflowId: "wf_complete",
      eventsPath,
      registryPath,
      dbPath,
      logStep: noopLog,
    });
    assert.equal(r.status, "complete");
    assert.equal(r.steps[0]?.status, "verified");
  });

  it("wf_missing → inconsistent / ROW_ABSENT", () => {
    const r = verifyWorkflow({
      workflowId: "wf_missing",
      eventsPath,
      registryPath,
      dbPath,
      logStep: noopLog,
    });
    assert.equal(r.status, "inconsistent");
    assert.equal(r.steps[0]?.status, "missing");
    assert.equal(r.steps[0]?.reasons[0]?.code, "ROW_ABSENT");
  });

  it("wf_partial → inconsistent / NULL_FIELD", () => {
    const r = verifyWorkflow({
      workflowId: "wf_partial",
      eventsPath,
      registryPath,
      dbPath,
      logStep: noopLog,
    });
    assert.equal(r.status, "inconsistent");
    assert.equal(r.steps[0]?.status, "partial");
    assert.equal(r.steps[0]?.reasons[0]?.code, "NULL_FIELD");
  });

  it("wf_inconsistent → inconsistent / VALUE_MISMATCH", () => {
    const r = verifyWorkflow({
      workflowId: "wf_inconsistent",
      eventsPath,
      registryPath,
      dbPath,
      logStep: noopLog,
    });
    assert.equal(r.status, "inconsistent");
    assert.equal(r.steps[0]?.status, "inconsistent");
    assert.equal(r.steps[0]?.reasons[0]?.code, "VALUE_MISMATCH");
  });

  it("wf_duplicate_rows → DUPLICATE_ROWS", () => {
    const r = verifyWorkflow({
      workflowId: "wf_duplicate_rows",
      eventsPath,
      registryPath,
      dbPath,
      logStep: noopLog,
    });
    assert.equal(r.status, "inconsistent");
    assert.equal(r.steps[0]?.reasons[0]?.code, "DUPLICATE_ROWS");
  });

  it("wf_unknown_tool → incomplete", () => {
    const r = verifyWorkflow({
      workflowId: "wf_unknown_tool",
      eventsPath,
      registryPath,
      dbPath,
      logStep: noopLog,
    });
    assert.equal(r.status, "incomplete");
    assert.equal(r.steps[0]?.status, "incomplete_verification");
    assert.equal(r.steps[0]?.reasons[0]?.code, "UNKNOWN_TOOL");
  });

  it("wf_dup_seq → incomplete run-level", () => {
    const r = verifyWorkflow({
      workflowId: "wf_dup_seq",
      eventsPath,
      registryPath,
      dbPath,
      logStep: noopLog,
    });
    assert.equal(r.status, "incomplete");
    assert.ok(r.runLevelCodes.includes("DUPLICATE_SEQ"));
  });

  it("ignores params.ok — fake success still needs row", () => {
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
    const r = verifyWorkflow({
      workflowId: "wf_fake_ok",
      eventsPath: eventsFile,
      registryPath,
      dbPath,
      logStep: noopLog,
    });
    assert.equal(r.status, "inconsistent");
    assert.equal(r.steps[0]?.status, "missing");
  });

  it("malformed line → MALFORMED_EVENT_LINE", () => {
    const badFile = join(dir, "bad.ndjson");
    writeFileSync(badFile, "not json\n");
    const r = verifyWorkflow({
      workflowId: "wf_complete",
      eventsPath: badFile,
      registryPath,
      dbPath,
      logStep: noopLog,
    });
    assert.equal(r.status, "incomplete");
    assert.ok(r.runLevelCodes.includes("MALFORMED_EVENT_LINE"));
  });

  it("empty workflow id filter → incomplete", () => {
    const r = verifyWorkflow({
      workflowId: "no_such_workflow",
      eventsPath,
      registryPath,
      dbPath,
      logStep: noopLog,
    });
    assert.equal(r.status, "incomplete");
    assert.equal(r.steps.length, 0);
  });
});
