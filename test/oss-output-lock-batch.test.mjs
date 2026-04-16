/**
 * OSS batch verify: --output-lock only under mkdtemp (no expect-lock).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "child_process";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliJs = join(root, "dist", "cli.js");
const eventsPath = join(root, "examples", "events.ndjson");
const registryPath = join(root, "examples", "tools.json");

describe("OSS batch --output-lock", () => {
  it("writes ci-lock under mkdtemp and exits 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "oss-out-lock-"));
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
          eventsPath,
          "--registry",
          registryPath,
          "--db",
          dbPath,
          "--no-truth-report",
          "--output-lock",
          lockPath,
        ],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 0, r.stderr);
      const raw = readFileSync(lockPath, "utf8");
      assert.ok(raw.includes('"kind"'));
      assert.ok(raw.includes("batch"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
