#!/usr/bin/env node
/**
 * CI contract: Quick Verify completes within budget and registry bytes match stdout.
 * Requires prior `npm run build` and temp SQLite DB from examples/seed.sql.
 */
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const seedSql = readFileSync(join(root, "examples", "seed.sql"), "utf8");
const passLinePath = join(root, "test", "fixtures", "quick-verify", "pass-line.ndjson");
const cliJs = join(root, "dist", "cli.js");

const tmp = mkdtempSync(join(tmpdir(), "qv-contract-"));
const dbPath = join(tmp, "c.db");
try {
  const db = new DatabaseSync(dbPath);
  db.exec(seedSql);
  db.close();

  const t0 = Date.now();
  const outReg = join(tmp, "reg.json");
  const r = spawnSync(
    process.execPath,
    [cliJs, "quick", "--input", passLinePath, "--db", dbPath, "--export-registry", outReg],
    { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
  );
  const ms = Date.now() - t0;
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  if (ms > 120_000) {
    console.error(`quick-verify-contract: exceeded 120s (took ${ms}ms)`);
    process.exit(1);
  }
  const line = r.stdout.trim().split("\n").filter((l) => l.startsWith("{")).pop();
  if (!line) {
    console.error("no JSON stdout line");
    process.exit(1);
  }
  const report = JSON.parse(line);
  const { canonicalToolsArrayUtf8 } = await import("../dist/quickVerify/canonicalJson.js");
  const fileUtf8 = readFileSync(outReg, "utf8");
  if (fileUtf8 !== canonicalToolsArrayUtf8(report.exportableRegistry.tools)) {
    console.error("registry file !== canonicalToolsArrayUtf8(stdout.tools)");
    process.exit(1);
  }
  console.log(`quick-verify-contract ok (${ms}ms)`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
