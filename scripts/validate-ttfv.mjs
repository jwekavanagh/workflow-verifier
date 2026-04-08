/**
 * Time-to-first-value gate: quick verify subprocess must finish within 180s (post-build).
 * Precondition: dist/cli.js exists (run npm run build first).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliJs = join(root, "dist", "cli.js");

try {
  readFileSync(cliJs);
} catch {
  console.error("validate-ttfv: run npm run build first");
  process.exit(1);
}

const seedSql = readFileSync(join(root, "examples", "seed.sql"), "utf8");
const tmp = mkdtempSync(join(tmpdir(), "ttfv-"));
const dbPath = join(tmp, "test.db");
const db = new DatabaseSync(dbPath);
db.exec(seedSql);
db.close();

const inputPath = join(root, "test", "fixtures", "quick-verify", "pass-line.ndjson");
const regPath = join(tmp, "reg.json");

const t0 = performance.now();
const r = spawnSync(
  process.execPath,
  [cliJs, "quick", "--input", inputPath, "--db", dbPath, "--export-registry", regPath],
  { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
);
const ms = performance.now() - t0;

try {
  rmSync(tmp, { recursive: true, force: true });
} catch {
  /* */
}

if (r.status !== 0) {
  console.error("validate-ttfv: quick verify failed", r.status, r.stderr);
  process.exit(1);
}

if (ms > 180_000) {
  console.error(`validate-ttfv: exceeded 180s wall clock (${Math.round(ms)}ms)`);
  process.exit(1);
}

process.exit(0);
