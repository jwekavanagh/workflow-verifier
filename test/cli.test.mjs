import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { CLI_OPERATIONAL_CODES } from "../dist/failureCatalog.js";
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
    assert.equal(stderr, formatWorkflowTruthReport(parsed).replace(/\r\n/g, "\n"));
  });

  it("--help exits 0 and prints usage to stdout", () => {
    const r = spawnSync(process.execPath, ["--no-warnings", cliJs, "--help"], {
      encoding: "utf8",
      cwd: root,
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("Usage:"));
    assert.equal(r.stderr.trim(), "");
  });

  it("missing args → exit 3 and stderr JSON CLI_USAGE", () => {
    const r = spawnSync(process.execPath, ["--no-warnings", cliJs, "--workflow-id", "w"], {
      encoding: "utf8",
      cwd: root,
    });
    assert.equal(r.status, 3);
    assert.equal(r.stdout.trim(), "");
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.kind, "execution_truth_layer_error");
    assert.equal(err.code, "CLI_USAGE");
    assert.ok(err.message.length > 0);
    assert.ok(err.message.length <= 2048);
  });

  it("eventual without window/poll → exit 3 CLI_USAGE", () => {
    const r = spawnSync(process.execPath, [
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
      "--consistency",
      "eventual",
    ], { encoding: "utf8", cwd: root });
    assert.equal(r.status, 3);
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.code, CLI_OPERATIONAL_CODES.CLI_USAGE);
  });

  it("eventual with poll > window → exit 3 VERIFICATION_POLICY_INVALID", () => {
    const r = spawnSync(process.execPath, [
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
      "--consistency",
      "eventual",
      "--verification-window-ms",
      "10",
      "--poll-interval-ms",
      "50",
    ], { encoding: "utf8", cwd: root });
    assert.equal(r.status, 3);
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.code, CLI_OPERATIONAL_CODES.VERIFICATION_POLICY_INVALID);
  });

  it("strong with window flag → exit 3 CLI_USAGE", () => {
    const r = spawnSync(process.execPath, [
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
      "--verification-window-ms",
      "100",
    ], { encoding: "utf8", cwd: root });
    assert.equal(r.status, 3);
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.code, CLI_OPERATIONAL_CODES.CLI_USAGE);
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
    const errText = r.stderr.replace(/\r\n/g, "\n");
    assert.ok(
      errText.includes(
        "trust: NOT TRUSTED: At least one step failed verification against the database (determinate failure).",
      ),
    );
  });
});
