/**
 * OSS build must refuse all non-help enforce invocations (ENFORCE_REQUIRES_COMMERCIAL_BUILD).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "child_process";
import { cliErrorEnvelope, CLI_OPERATIONAL_CODES } from "../dist/failureCatalog.js";
import { ENFORCE_OSS_GATE_MESSAGE } from "../dist/enforceCli.js";
import { EXPECT_LOCK_REQUIRES_COMMERCIAL_BUILD_MESSAGE } from "../dist/cli/lockOrchestration.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliJs = join(root, "dist", "cli.js");

const expectedStderr = cliErrorEnvelope(
  CLI_OPERATIONAL_CODES.ENFORCE_REQUIRES_COMMERCIAL_BUILD,
  ENFORCE_OSS_GATE_MESSAGE,
);

const expectedExpectLockOssStderr = cliErrorEnvelope(
  CLI_OPERATIONAL_CODES.ENFORCE_REQUIRES_COMMERCIAL_BUILD,
  EXPECT_LOCK_REQUIRES_COMMERCIAL_BUILD_MESSAGE,
);

function runCli(args) {
  return spawnSync(process.execPath, ["--no-warnings", cliJs, ...args], {
    encoding: "utf8",
    cwd: root,
  });
}

describe("enforce OSS forbidden", () => {
  it("enforce with no subcommand exits 3 with commercial-build envelope", () => {
    const r = runCli(["enforce"]);
    assert.equal(r.status, 3);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr.trim(), expectedStderr);
  });

  it("enforce batch without lock flags exits 3 with commercial-build envelope", () => {
    const r = runCli([
      "enforce",
      "batch",
      "--workflow-id",
      "wf_complete",
      "--events",
      join(root, "examples", "events.ndjson"),
      "--registry",
      join(root, "examples", "tools.json"),
      "--db",
      join(root, "examples", "demo.db"),
      "--no-truth-report",
    ]);
    assert.equal(r.status, 3);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr.trim(), expectedStderr);
  });

  it("enforce quick exits 3 with commercial-build envelope before quick parse", () => {
    const r = runCli(["enforce", "quick"]);
    assert.equal(r.status, 3);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr.trim(), expectedStderr);
  });

  it("enforce with invalid subcommand exits 3 with commercial-build envelope", () => {
    const r = runCli(["enforce", "nonsense"]);
    assert.equal(r.status, 3);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr.trim(), expectedStderr);
  });

  it("enforce --help exits 0 and prints Usage", () => {
    const r = runCli(["enforce", "--help"]);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("Usage:"));
  });

  it("batch verify with --expect-lock exits 3 with commercial-build envelope (OSS)", () => {
    const r = runCli([
      "--workflow-id",
      "wf_complete",
      "--events",
      join(root, "examples", "events.ndjson"),
      "--registry",
      join(root, "examples", "tools.json"),
      "--db",
      join(root, "examples", "demo.db"),
      "--no-truth-report",
      "--expect-lock",
      join(root, "test", "fixtures", "ci-enforcement", "wf_complete.ci-lock-v1.json"),
    ]);
    assert.equal(r.status, 3);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr.trim(), expectedExpectLockOssStderr);
  });
});
