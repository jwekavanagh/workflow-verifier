/**
 * PR-O2: deterministic integrate spine Step 3 — bootstrap then contract verify on examples/demo.db.
 * Execution sequence is fixed in docs/first-run-integration.md §Validation execution path.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");

function runNode(args, env = process.env) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env,
    shell: false,
  });
}

function runNpm(args, env = process.env) {
  return spawnSync("npm", args, {
    cwd: root,
    encoding: "utf8",
    env,
    shell: true,
  });
}

describe("integrate spine step3 chain (happy)", () => {
  it("build, demo.mjs, bootstrap pack, verify wf_bootstrap_fixture complete", () => {
    let r = runNpm(["run", "build"]);
    assert.equal(r.status, 0, r.stderr || r.stdout);

    r = runNode([join(root, "scripts", "demo.mjs")]);
    assert.equal(r.status, 0, r.stderr || r.stdout);

    const outDir = join(tmpdir(), `integrate-spine-step3-${randomBytes(8).toString("hex")}`);
    assert.ok(!existsSync(outDir), "bootstrap --out must not exist yet");
    try {
      const cli = join(root, "dist", "cli.js");
      const db = join(root, "examples", "demo.db");
      const input = join(root, "test", "fixtures", "bootstrap-pack", "input.json");
      assert.ok(existsSync(db), "examples/demo.db must exist after demo.mjs");

      r = runNode([
        cli,
        "bootstrap",
        "--input",
        input,
        "--db",
        db,
        "--out",
        outDir,
      ]);
      assert.equal(r.status, 0, r.stderr + r.stdout);
      assert.equal(r.stderr, "");

      r = runNode([
        cli,
        "--workflow-id",
        "wf_bootstrap_fixture",
        "--events",
        join(outDir, "events.ndjson"),
        "--registry",
        join(outDir, "tools.json"),
        "--db",
        db,
      ]);
      assert.equal(r.status, 0, r.stderr + r.stdout);

      const lines = r.stdout
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const lastLine = lines[lines.length - 1];
      assert.ok(lastLine, "verify stdout must include JSON");
      const parsed = JSON.parse(lastLine);
      assert.equal(parsed.status, "complete");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
