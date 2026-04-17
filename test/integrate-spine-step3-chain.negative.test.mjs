/**
 * PR-O2 chain-level negative: bootstrap refuses existing --out (same surface as integrate Step 3).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");

describe("integrate spine step3 chain (negative)", () => {
  it("bootstrap exits 3 with BOOTSTRAP_OUT_EXISTS when --out already exists", () => {
    const seedSql = readFileSync(join(root, "examples", "seed.sql"), "utf8");
    const dbDir = mkdtempSync(join(tmpdir(), "spine-neg-db-"));
    const dbPath = join(dbDir, "test.db");
    try {
      const db = new DatabaseSync(dbPath);
      db.exec(seedSql);
      db.close();

      const blockedOut = join(dbDir, "pack-out-exists");
      mkdirSync(blockedOut, { recursive: true });

      const cli = join(root, "dist", "cli.js");
      const input = join(root, "test", "fixtures", "bootstrap-pack", "input.json");
      const r = spawnSync(
        process.execPath,
        [cli, "bootstrap", "--input", input, "--db", dbPath, "--out", blockedOut],
        { cwd: root, encoding: "utf8" },
      );
      assert.equal(r.status, 3, r.stderr + r.stdout);
      assert.equal(r.stdout, "");
      assert.ok(r.stderr.includes("BOOTSTRAP_OUT_EXISTS"), r.stderr);
    } finally {
      rmSync(dbDir, { recursive: true, force: true });
    }
  });
});
