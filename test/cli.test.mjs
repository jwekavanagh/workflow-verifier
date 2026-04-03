import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { formatWorkflowTruthReport } from "../dist/workflowTruthReport.js";
import { loadSchemaValidator } from "../dist/schemaLoad.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliJs = join(root, "dist", "cli.js");

describe("CLI verify-workflow", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "etl-cli-"));
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

  it("stderr report then stdout JSON; stderr equals formatWorkflowTruthReport(stdout)", () => {
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
    const stdout = r.stdout.trimEnd();
    const stderr = r.stderr.replace(/\r\n/g, "\n").replace(/\n$/, "");
    const parsed = JSON.parse(stdout);
    const validateResult = loadSchemaValidator("workflow-result");
    assert.equal(validateResult(parsed), true);
    assert.equal(stderr, formatWorkflowTruthReport(parsed));
  });

  it("wf_missing exit 1 and inconsistent trust line", () => {
    const r = spawnSync(process.execPath, [
      "--no-warnings",
      cliJs,
      "--workflow-id",
      "wf_missing",
      "--events",
      eventsPath,
      "--registry",
      registryPath,
      "--db",
      dbPath,
    ], { encoding: "utf8", cwd: root });
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.status, "inconsistent");
    assert.ok(
      r.stderr.includes(
        "trust: NOT_TRUSTED: At least one step failed verification against the database (determinate failure).",
      ),
    );
  });
});
