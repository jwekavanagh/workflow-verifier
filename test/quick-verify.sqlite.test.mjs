/**
 * Quick Verify CLI + runQuickVerify against SQLite temp DB from examples/seed.sql
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { runQuickVerify } from "../dist/quickVerify/runQuickVerify.js";
import { canonicalToolsArrayUtf8 } from "../dist/quickVerify/canonicalJson.js";
import { loadSchemaValidator } from "../dist/schemaLoad.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const seedSql = readFileSync(join(root, "examples", "seed.sql"), "utf8");
const passLine = readFileSync(join(root, "test", "fixtures", "quick-verify", "pass-line.ndjson"), "utf8");
const cliJs = join(root, "dist", "cli.js");

describe("Quick Verify SQLite", () => {
  let tmp;
  let dbPath;

  before(() => {
    tmp = mkdtempSync(join(tmpdir(), "qv-sqlite-"));
    dbPath = join(tmp, "test.db");
    const db = new DatabaseSync(dbPath);
    db.exec(seedSql);
    db.close();
  });

  it("runQuickVerify passes for matching row", async () => {
    const { report, registryUtf8 } = await runQuickVerify({
      inputUtf8: passLine,
      sqlitePath: dbPath,
    });
    assert.equal(report.verdict, "pass");
    assert.ok(report.units.length >= 1);
    const v = loadSchemaValidator("quick-verify-report");
    assert.ok(v(report), JSON.stringify(v.errors ?? []));
    const readBack = canonicalToolsArrayUtf8(report.exportableRegistry.tools);
    assert.equal(registryUtf8, readBack);
  });

  it("CLI quick exits 0 and registry bytes match stdout", () => {
    const outReg = join(tmp, "exported.json");
    const r = spawnSync(
      process.execPath,
      [cliJs, "quick", "--input", join(root, "test", "fixtures", "quick-verify", "pass-line.ndjson"), "--db", dbPath, "--export-registry", outReg],
      { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
    );
    assert.equal(r.status, 0, r.stderr);
    const line = r.stdout.trim().split("\n").filter(Boolean).pop();
    const report = JSON.parse(line);
    const fileUtf8 = readFileSync(outReg, "utf8");
    assert.equal(fileUtf8, canonicalToolsArrayUtf8(report.exportableRegistry.tools));
  });
});
