/**
 * Behavioral tests for scripts/lib/quickVerifyPostbuildGate.mjs
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  runQuickVerifyPostbuildGate,
  QUICK_VERIFY_SPAWN_TIMEOUT_MS,
  spawnSyncTimedOut,
} from "../scripts/lib/quickVerifyPostbuildGate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distCli = join(root, "dist", "cli.js");
const cliHang = join(root, "test", "fixtures", "quick-verify-gate", "cli-hang.mjs");

describe("quickVerifyPostbuildGate", () => {
  before(() => {
    assert.doesNotThrow(() => readFileSync(distCli), "dist/cli.js must exist (run npm run build before test:node:sqlite)");
  });

  it("spawnSync timeout surfaces for hung child (Node API sanity)", () => {
    const r = spawnSync(process.execPath, ["-e", "while(true){}"], {
      encoding: "utf8",
      timeout: 400,
      maxBuffer: 1_000_000,
    });
    assert.ok(
      spawnSyncTimedOut(r) || r.error?.code === "ETIMEDOUT",
      `expected timeout outcome, got status=${r.status} signal=${r.signal} err=${r.error?.code}`,
    );
  });

  it("postbuild gate fails fast when CLI never exits", async () => {
    const result = await runQuickVerifyPostbuildGate({
      root,
      cliJs: cliHang,
      spawnTimeoutMs: 800,
    });
    assert.notEqual(result.exitCode, 0);
    assert.equal(result.spawnTimedOut, true, result.stderrSummary);
    assert.ok(result.elapsedMs < 5000, `elapsed ${result.elapsedMs} should be bounded`);
  });

  it("postbuild gate succeeds against real dist/cli.js", async () => {
    const result = await runQuickVerifyPostbuildGate({
      root,
      cliJs: distCli,
      spawnTimeoutMs: QUICK_VERIFY_SPAWN_TIMEOUT_MS,
    });
    assert.equal(result.exitCode, 0, result.stderrSummary);
    assert.equal(result.report?.schemaVersion, 4);
    assert.equal(result.registryUtf8Match, true);
    assert.ok(result.elapsedMs <= QUICK_VERIFY_SPAWN_TIMEOUT_MS, `elapsed ${result.elapsedMs}ms`);
    assert.ok(
      Array.isArray(result.report?.exportableRegistry?.tools) && result.report.exportableRegistry.tools.length > 0,
      "exportableRegistry.tools non-empty",
    );
  });
});
