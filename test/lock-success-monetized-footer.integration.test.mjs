/**
 * Batch verify + --output-lock success emits monetized-boundary stderr literals (machine-checked).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "child_process";
import { DatabaseSync } from "node:sqlite";
import {
  LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_A,
  LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_B,
} from "../dist/cli/lockOrchestration.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliJs = join(root, "dist", "cli.js");

describe("lock success monetized boundary footers", () => {
  it("stderr includes exported literals after exit 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "lock-footer-"));
    try {
      const dbPath = join(dir, "demo.db");
      const sql = readFileSync(join(root, "examples", "seed.sql"), "utf8");
      const db = new DatabaseSync(dbPath);
      db.exec(sql);
      db.close();
      const lockPath = join(dir, "out.ci-lock-v1.json");
      const r = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          cliJs,
          "--workflow-id",
          "wf_complete",
          "--events",
          join(root, "examples", "events.ndjson"),
          "--registry",
          join(root, "examples", "tools.json"),
          "--db",
          dbPath,
          "--no-truth-report",
          "--output-lock",
          lockPath,
        ],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 0, r.stderr);
      assert.ok(r.stderr.includes(LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_A), r.stderr);
      assert.ok(r.stderr.includes(LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_B), r.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
