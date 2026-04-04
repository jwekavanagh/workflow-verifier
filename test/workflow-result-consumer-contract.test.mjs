/**
 * Legacy stdout shape: required keys for 0.x consumers plus runLevelReasons.
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
      "runLevelCodes",
      "steps",
      "runLevelReasons",
      "verificationPolicy",
      "eventSequenceIntegrity",
      "workflowTruthReport",
    ]) {
      assert.ok(k in parsed, `missing key ${k}`);
    }
    assert.equal(parsed.schemaVersion, 9);
    assert.equal(typeof parsed.schemaVersion, "number");
    assert.equal(typeof parsed.workflowId, "string");
    assert.equal(typeof parsed.status, "string");
    assert.ok(Array.isArray(parsed.runLevelCodes));
    assert.ok(Array.isArray(parsed.runLevelReasons));
    assert.ok(Array.isArray(parsed.steps));
    assert.equal(parsed.runLevelReasons.length, 0);
    assert.equal(parsed.runLevelCodes.length, 0);
    assert.equal(parsed.runLevelCodes.length, parsed.runLevelReasons.length);
  });
});
