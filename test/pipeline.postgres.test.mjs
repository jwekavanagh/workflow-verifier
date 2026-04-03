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

  it("CLI postgres-url: success exit 0", () => {
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
        verifyUrl,
      ],
      { encoding: "utf8", cwd: root, env: { ...process.env, POSTGRES_VERIFICATION_URL: verifyUrl } },
    );
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout.trim());
    const validateResult = loadSchemaValidator("workflow-result");
    assert.equal(validateResult(parsed), true);
    assert.equal(parsed.status, "complete");
  });

  it("CLI invalid postgres port → exit 2 and stderr", () => {
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
    assert.equal(r.status, 2);
    assert.ok(r.stderr.trim().length > 0);
    assert.equal(r.stdout.trim(), "");
  });

  it("CLI both --db and --postgres-url → exit 2", () => {
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
    assert.equal(r.status, 2);
  });
});
