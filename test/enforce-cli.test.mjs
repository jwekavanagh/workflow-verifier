/**
 * agentskeptic enforce: XOR flags, expect-lock, output-lock, exit 4 stream contract.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "child_process";
import { DatabaseSync } from "node:sqlite";
import { loadSchemaValidator } from "../dist/schemaLoad.js";
import { workflowResultToCiLockV1, stableStringify } from "../dist/ciLock.js";
import {
  LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_A,
  LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_B,
} from "../dist/cli/lockOrchestration.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliJs = join(root, "dist", "cli.js");
const eventsPath = join(root, "examples", "events.ndjson");
const registryPath = join(root, "examples", "tools.json");
const lockComplete = join(root, "test", "fixtures", "ci-enforcement", "wf_complete.ci-lock-v1.json");
const lockQuick = join(root, "test", "fixtures", "ci-enforcement", "quick_pass.ci-lock-v1.json");
const quickInput = join(root, "test", "fixtures", "quick-verify", "pass-line.ndjson");

describe("enforce CLI", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "etl-enforce-"));
    dbPath = join(dir, "demo.db");
    const sql = readFileSync(join(root, "examples", "seed.sql"), "utf8");
    const db = new DatabaseSync(dbPath);
    db.exec(sql);
    db.close();
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("enforce batch rejects --output-lock compare-only (exit 3)", () => {
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "enforce",
        "batch",
        "--workflow-id",
        "wf_complete",
        "--events",
        eventsPath,
        "--registry",
        registryPath,
        "--db",
        dbPath,
        "--no-truth-report",
        "--output-lock",
        join(dir, "reject.json"),
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 3);
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.code, "ENFORCE_USAGE");
  });

  it("enforce batch rejects missing lock flags (exit 3)", () => {
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "enforce",
        "batch",
        "--workflow-id",
        "wf_complete",
        "--events",
        eventsPath,
        "--registry",
        registryPath,
        "--db",
        dbPath,
        "--no-truth-report",
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 3);
    assert.equal(r.stdout.trim(), "");
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.code, "ENFORCE_USAGE");
  });

  it("enforce batch rejects both lock flags (exit 3)", () => {
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "enforce",
        "batch",
        "--workflow-id",
        "wf_complete",
        "--events",
        eventsPath,
        "--registry",
        registryPath,
        "--db",
        dbPath,
        "--no-truth-report",
        "--expect-lock",
        lockComplete,
        "--output-lock",
        join(dir, "x.json"),
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 3);
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.code, "ENFORCE_USAGE");
  });

  it("enforce batch expect-lock wf_complete exits 0", () => {
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "enforce",
        "batch",
        "--workflow-id",
        "wf_complete",
        "--events",
        eventsPath,
        "--registry",
        registryPath,
        "--db",
        dbPath,
        "--no-truth-report",
        "--expect-lock",
        lockComplete,
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stderr.includes(LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_A));
    assert.ok(r.stderr.includes(LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_B));
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.status, "complete");
  });

  it("enforce batch expect-lock mismatch exits 4; stderr last line is envelope; --no-truth-report stderr only envelope", () => {
    const badLock = join(dir, "bad-lock.json");
    const good = JSON.parse(readFileSync(lockComplete, "utf8"));
    good.workflowId = "tampered_wf_id";
    writeFileSync(badLock, stableStringify(good) + "\n", "utf8");
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "enforce",
        "batch",
        "--workflow-id",
        "wf_complete",
        "--events",
        eventsPath,
        "--registry",
        registryPath,
        "--db",
        dbPath,
        "--no-truth-report",
        "--expect-lock",
        badLock,
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 4);
    const lines = r.stderr.trim().split("\n");
    const last = JSON.parse(lines[lines.length - 1]);
    assert.equal(last.code, "VERIFICATION_OUTPUT_LOCK_MISMATCH");
    assert.equal(lines.length, 1);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.workflowId, "wf_complete");
  });

  it("batch verify output-lock then enforce batch expect-lock round-trip", () => {
    const outLock = join(dir, "round.json");
    const r1 = spawnSync(
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
        "--no-truth-report",
        "--output-lock",
        outLock,
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r1.status, 0, r1.stderr);
    const raw = readFileSync(outLock, "utf8");
    const v = loadSchemaValidator("ci-lock-v1");
    assert.equal(v(JSON.parse(raw)), true);
    const r2 = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "enforce",
        "batch",
        "--workflow-id",
        "wf_complete",
        "--events",
        eventsPath,
        "--registry",
        registryPath,
        "--db",
        dbPath,
        "--no-truth-report",
        "--expect-lock",
        outLock,
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r2.status, 0, r2.stderr);
    assert.ok(r2.stderr.includes(LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_A));
  });

  it("enforce quick expect-lock exits 0", () => {
    const reg = join(dir, "qreg.json");
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "enforce",
        "quick",
        "--input",
        quickInput,
        "--db",
        dbPath,
        "--export-registry",
        reg,
        "--expect-lock",
        lockQuick,
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stderr.includes(LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_A));
  });

  it("enforce quick lock mismatch exits 4; stderr last line envelope", () => {
    const bad = join(dir, "badq.json");
    const g = JSON.parse(readFileSync(lockQuick, "utf8"));
    g.verdict = "fail";
    writeFileSync(bad, stableStringify(g) + "\n", "utf8");
    const reg = join(dir, "qreg2.json");
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "enforce",
        "quick",
        "--input",
        quickInput,
        "--db",
        dbPath,
        "--export-registry",
        reg,
        "--expect-lock",
        bad,
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 4);
    const lines = r.stderr.trim().split("\n");
    const last = JSON.parse(lines[lines.length - 1]);
    assert.equal(last.code, "VERIFICATION_OUTPUT_LOCK_MISMATCH");
    assert.ok(lines.length >= 2);
    JSON.parse(r.stdout.trim());
  });
});

describe("ciLock projection mutation", () => {
  it("workflowResultToCiLockV1 changes when status flipped", () => {
    const stdoutPath = join(root, "examples", "debug-corpus", "run_ok", "workflow-result.json");
    const wr = JSON.parse(readFileSync(stdoutPath, "utf8"));
    const a = workflowResultToCiLockV1(wr);
    const b = workflowResultToCiLockV1({ ...wr, status: "inconsistent" });
    assert.notEqual(stableStringify(a), stableStringify(b));
  });
});
