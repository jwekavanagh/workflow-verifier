/**
 * WorkflowResult stdout: required keys for consumers plus runLevelReasons (v11).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliJs = join(root, "dist", "cli.js");

describe("WorkflowResult consumer contract (CLI stdout)", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "etl-consumer-"));
    dbPath = join(dir, "test.db");
    const sql = readFileSync(join(root, "examples", "seed.sql"), "utf8");
    const db = new DatabaseSync(dbPath);
    db.exec(sql);
    db.close();
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("wf_complete includes legacy keys and runLevelReasons", () => {
    const eventsPath = join(root, "examples", "events.ndjson");
    const registryPath = join(root, "examples", "tools.json");
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "--workflow-id",
        "wf_complete",
        "--events",
        eventsPath,
        "--registry",
        registryPath,
        "--db",
        dbPath,
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout.trim());
    for (const k of [
      "schemaVersion",
      "workflowId",
      "status",
      "steps",
      "runLevelReasons",
      "verificationPolicy",
      "eventSequenceIntegrity",
      "workflowTruthReport",
    ]) {
      assert.ok(k in parsed, `missing key ${k}`);
    }
    assert.equal(parsed.schemaVersion, 15);
    assert.equal(typeof parsed.schemaVersion, "number");
    assert.equal(typeof parsed.workflowId, "string");
    assert.equal(typeof parsed.status, "string");
    assert.ok(Array.isArray(parsed.runLevelReasons));
    assert.ok(Array.isArray(parsed.steps));
    assert.equal(parsed.runLevelReasons.length, 0);
    const s0 = parsed.steps[0];
    assert.ok(s0 && typeof s0 === "object");
    assert.equal(s0.intendedEffect?.narrative?.includes("Upsert contact"), true);
    assert.equal(
      s0.observedExecution?.paramsCanonical,
      '{"fields":{"name":"Alice","status":"active"},"recordId":"c_ok"}',
    );
    assert.equal(parsed.workflowTruthReport?.schemaVersion, 9);
  });
});
