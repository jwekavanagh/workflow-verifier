/**
 * Minimal external-style CI check: seed SQLite from bundled files, run enforce batch with expect-lock.
 * Run from repo root after build: node examples/minimal-ci-enforcement/run.mjs
 */
import { readFileSync, mkdtempSync, rmSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const here = __dirname;
const root = join(__dirname, "..", "..");
const cliJs = join(root, "dist", "cli.js");
const dbDir = mkdtempSync(join(tmpdir(), "minimal-ci-"));
const dbPath = join(dbDir, "app.db");
try {
  const sql = readFileSync(join(here, "seed.sql"), "utf8");
  const db = new DatabaseSync(dbPath);
  db.exec(sql);
  db.close();

  const eventsPath = join(here, "events.ndjson");
  const registryPath = join(here, "tools.json");
  const lockPath = join(here, "wf_complete.ci-lock-v1.json");

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
      lockPath,
    ],
    { encoding: "utf8", cwd: root },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
} finally {
  rmSync(dbDir, { recursive: true, force: true });
}
