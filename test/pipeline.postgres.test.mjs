/**
 * Batch verification against Postgres via verifyWorkflow (verifier_ro).
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { verifyWorkflow } from "../dist/pipeline.js";
import { loadSchemaValidator } from "../dist/schemaLoad.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const eventsPath = join(root, "examples", "events.ndjson");
const registryPath = join(root, "examples", "tools.json");
const eventsMulti = join(root, "test/fixtures/multi-effect/events.ndjson");
const registryMulti = join(root, "test/fixtures/multi-effect/tools.json");
const goldenMultiOk = JSON.parse(
  readFileSync(join(root, "test/golden/wf_multi_ok.stdout.json"), "utf8"),
);
const cliJs = join(root, "dist", "cli.js");

const verifyUrl = process.env.POSTGRES_VERIFICATION_URL;

describe("verifyWorkflow Postgres integration", () => {
  before(() => {
    assert.ok(verifyUrl && verifyUrl.length > 0, "POSTGRES_VERIFICATION_URL must be set");
  });

  const noopLog = () => {};
  const pgDb = () => ({ kind: "postgres", connectionString: verifyUrl });

  it("wf_complete → complete / verified", async () => {
    const r = await verifyWorkflow({
      workflowId: "wf_complete",
      eventsPath,
      registryPath,
      database: pgDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.equal(r.status, "complete");
    assert.equal(r.steps[0]?.status, "verified");
    assert.equal(r.schemaVersion, 6);
    assert.deepStrictEqual(r.verificationPolicy, {
      consistencyMode: "strong",
      verificationWindowMs: 0,
      pollIntervalMs: 0,
    });
  });

  it("wf_complete eventual wiring → complete, policy echoed", async () => {
    const r = await verifyWorkflow({
      workflowId: "wf_complete",
      eventsPath,
      registryPath,
      database: pgDb(),
      logStep: noopLog,
      truthReport: () => {},
      verificationPolicy: {
        consistencyMode: "eventual",
        verificationWindowMs: 500,
        pollIntervalMs: 100,
      },
    });
    assert.equal(r.status, "complete");
    assert.equal(r.steps[0]?.status, "verified");
    assert.deepStrictEqual(r.verificationPolicy, {
      consistencyMode: "eventual",
      verificationWindowMs: 500,
      pollIntervalMs: 100,
    });
  });

  it("wf_missing → inconsistent / ROW_ABSENT", async () => {
    const r = await verifyWorkflow({
      workflowId: "wf_missing",
      eventsPath,
      registryPath,
      database: pgDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.equal(r.status, "inconsistent");
    assert.equal(r.steps[0]?.status, "missing");
    assert.equal(r.steps[0]?.reasons[0]?.code, "ROW_ABSENT");
  });

  it("wf_multi_ok matches SQLite golden (multi-effect)", async () => {
    const r = await verifyWorkflow({
      workflowId: "wf_multi_ok",
      eventsPath: eventsMulti,
      registryPath: registryMulti,
      database: pgDb(),
      logStep: noopLog,
      truthReport: () => {},
    });
    assert.deepStrictEqual(r, goldenMultiOk);
    const v = loadSchemaValidator("workflow-result");
    if (!v(r)) {
      assert.fail(JSON.stringify(v.errors ?? []));
    }
  });

  it("nonexistent table → CONNECTOR_ERROR / incomplete", async () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-pg-"));
    const regPath = join(dir, "tools.json");
    const reg = JSON.parse(readFileSync(registryPath, "utf8"));
    reg[0].verification.table = { const: "no_such_table_xyz" };
    writeFileSync(regPath, JSON.stringify(reg));
    try {
      const r = await verifyWorkflow({
        workflowId: "wf_complete",
        eventsPath,
        registryPath: regPath,
        database: pgDb(),
        logStep: noopLog,
        truthReport: () => {},
      });
      assert.equal(r.status, "incomplete");
      assert.equal(r.steps[0]?.status, "incomplete_verification");
      assert.equal(r.steps[0]?.reasons[0]?.code, "CONNECTOR_ERROR");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CLI invalid postgres port → exit 3 and stderr JSON", () => {
    const badUrl = "postgresql://verifier_ro:verifier@127.0.0.1:65534/postgres";
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
        "--postgres-url",
        badUrl,
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 3);
    assert.equal(r.stdout.trim(), "");
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.kind, "execution_truth_layer_error");
    assert.equal(err.code, "POSTGRES_CLIENT_SETUP_FAILED");
    assert.ok(typeof err.message === "string");
  });

  it("CLI both --db and --postgres-url → exit 3 CLI_USAGE", () => {
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
        "/nope.db",
        "--postgres-url",
        verifyUrl,
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 3);
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.code, "CLI_USAGE");
  });
});
