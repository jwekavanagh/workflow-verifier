/**
 * CI workflow truth contract (Postgres CLI): machine-enforced parity with docs/execution-truth-layer.md
 * "### CI workflow truth contract (Postgres CLI)".
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadSchemaValidator } from "../dist/schemaLoad.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliJs = join(root, "dist", "cli.js");
const eventsPath = join(root, "examples", "events.ndjson");
const registryPath = join(root, "examples", "tools.json");

describe("CI workflow truth contract (Postgres CLI)", () => {
  const verifyUrl = process.env.POSTGRES_VERIFICATION_URL;

  before(() => {
    assert.ok(verifyUrl && verifyUrl.length > 0, "POSTGRES_VERIFICATION_URL must be set");
  });

  const env = { ...process.env, POSTGRES_VERIFICATION_URL: verifyUrl };

  it("case 1: wf_complete exit 0; stdout WorkflowResult; stderr empty with --no-truth-report", () => {
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
        "--no-truth-report",
      ],
      { encoding: "utf8", cwd: root, env },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
    const parsed = JSON.parse(r.stdout.trim());
    const validateResult = loadSchemaValidator("workflow-result");
    assert.equal(validateResult(parsed), true, JSON.stringify(validateResult.errors ?? []));
    assert.equal(parsed.schemaVersion, 6);
    assert.equal(parsed.workflowId, "wf_complete");
    assert.equal(parsed.status, "complete");
    assert.equal(parsed.steps[0]?.status, "verified");
    assert.deepStrictEqual(parsed.runLevelReasons, []);
    assert.deepStrictEqual(parsed.runLevelCodes, []);
  });

  it("case 2: wf_missing exit 1; stderr empty with --no-truth-report", () => {
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "--workflow-id",
        "wf_missing",
        "--events",
        eventsPath,
        "--registry",
        registryPath,
        "--postgres-url",
        verifyUrl,
        "--no-truth-report",
      ],
      { encoding: "utf8", cwd: root, env },
    );
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.stderr, "");
    const parsed = JSON.parse(r.stdout.trim());
    const validateResult = loadSchemaValidator("workflow-result");
    assert.equal(validateResult(parsed), true);
    assert.equal(parsed.workflowId, "wf_missing");
    assert.equal(parsed.status, "inconsistent");
    assert.equal(parsed.steps[0]?.status, "missing");
    assert.equal(parsed.steps[0]?.reasons[0]?.code, "ROW_ABSENT");
  });

  it("case 3: operational CLI_USAGE — only --workflow-id wf_complete", () => {
    const r = spawnSync(
      process.execPath,
      ["--no-warnings", cliJs, "--workflow-id", "wf_complete"],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 3);
    assert.equal(r.stdout.trim(), "");
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.kind, "execution_truth_layer_error");
    assert.equal(err.code, "CLI_USAGE");
    assert.equal(typeof err.message, "string");
    assert.ok(err.message.length > 0);
    assert.ok(err.message.length <= 2048);
  });
});
