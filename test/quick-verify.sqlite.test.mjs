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
import {
  HUMAN_REPORT_BEGIN,
  HUMAN_REPORT_END,
  MSG_NO_STRUCTURED_TOOL_ACTIVITY,
  MSG_NO_TOOL_CALLS,
  verdictLine,
} from "../dist/quickVerify/quickVerifyHumanCopy.js";
import {
  QUICK_VERIFY_BANNER_LINE_1,
  QUICK_VERIFY_BANNER_LINE_2,
  QUICK_VERIFY_BANNER_LINE_3,
} from "../dist/quickVerify/formatQuickVerifyHumanReport.js";
import { buildQuickVerifyProductTruth } from "../dist/quickVerify/quickVerifyProductTruth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const seedSql = readFileSync(join(root, "examples", "seed.sql"), "utf8");
const passLine = readFileSync(join(root, "test", "fixtures", "quick-verify", "pass-line.ndjson"), "utf8");
const cliJs = join(root, "dist", "cli.js");

function assertHumanAnchors(stderr, verdict) {
  const lines = stderr.split(/\r?\n/);
  const i = lines.findIndex((l) => l === HUMAN_REPORT_BEGIN);
  assert.ok(i >= 0, "missing human report begin anchor");
  assert.equal(lines[i + 1], verdictLine(verdict));
  assert.equal(lines[i + 2], HUMAN_REPORT_END);
  assert.equal(lines[i + 3], QUICK_VERIFY_BANNER_LINE_1);
  assert.equal(lines[i + 4], QUICK_VERIFY_BANNER_LINE_2);
  assert.equal(lines[i + 5], QUICK_VERIFY_BANNER_LINE_3);
}

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
    const { report, registryUtf8, contractExports } = await runQuickVerify({
      inputUtf8: passLine,
      sqlitePath: dbPath,
    });
    assert.equal(report.schemaVersion, 4);
    const expectedPartial =
      report.exportableRegistry.tools.length > 0 && report.units.some((u) => !u.contractEligible);
    assert.deepEqual(report.productTruth, buildQuickVerifyProductTruth(expectedPartial));
    assert.equal(report.verdict, "pass");
    assert.equal(report.verificationMode, "inferred");
    assert.ok(report.units.length >= 1);
    const row = report.units.find((u) => u.kind === "row" && u.verdict === "verified");
    assert.ok(row);
    assert.equal(row.sourceAction.toolName, "crm.upsert_contact");
    assert.equal(row.sourceAction.actionIndex, 0);
    assert.equal(row.contractEligible, true);
    const v = loadSchemaValidator("quick-verify-report");
    assert.ok(v(report), JSON.stringify(v.errors ?? []));
    assert.equal(report.scope.quickVerifyVersion, "1.1.0");
    assert.equal(report.scope.ingestContract, "structured_tool_activity");
    assert.equal(report.scope.groundTruth, "read_only_sql");
    assert.deepEqual(report.scope.limitations, [
      "quick_verify_inferred_row_and_related_exists_only",
      "no_multi_effect_contract",
      "no_destructive_or_forbidden_row_contract",
      "contract_replay_export_row_and_eligible_related_exists_tools",
    ]);
    const readBack = canonicalToolsArrayUtf8(report.exportableRegistry.tools);
    assert.equal(registryUtf8, readBack);
    assert.ok(contractExports.length >= 1);
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
    assertHumanAnchors(r.stderr, "pass");
  });

  it("whitespace-only input: exit 2, INGEST_NO_ACTIONS, anchors", () => {
    const outReg = join(tmp, "ws.json");
    const inPath = join(tmp, "ws.txt");
    writeFileSync(inPath, "  \n\t  \n", "utf8");
    const r = spawnSync(
      process.execPath,
      [cliJs, "quick", "--input", inPath, "--db", dbPath, "--export-registry", outReg],
      { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
    );
    assert.equal(r.status, 2, r.stderr);
    const line = r.stdout.trim().split("\n").filter(Boolean).pop();
    const report = JSON.parse(line);
    assert.ok(report.ingest.reasonCodes.includes("INGEST_NO_ACTIONS"));
    assert.equal(report.verdict, "uncertain");
    assert.ok(report.summary.includes(MSG_NO_TOOL_CALLS));
    assertHumanAnchors(r.stderr, "uncertain");
    assert.ok(r.stderr.includes(MSG_NO_TOOL_CALLS));
  });

  it("non-empty JSON with no tools: exit 2, INGEST_NO_STRUCTURED_TOOL_ACTIVITY, anchors", () => {
    const outReg = join(tmp, "none.json");
    const inPath = join(tmp, "empty.json");
    writeFileSync(inPath, "{}", "utf8");
    const r = spawnSync(
      process.execPath,
      [cliJs, "quick", "--input", inPath, "--db", dbPath, "--export-registry", outReg],
      { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
    );
    assert.equal(r.status, 2, r.stderr);
    const line = r.stdout.trim().split("\n").filter(Boolean).pop();
    const report = JSON.parse(line);
    assert.ok(report.ingest.reasonCodes.includes("INGEST_NO_STRUCTURED_TOOL_ACTIVITY"));
    assert.equal(report.verdict, "uncertain");
    assert.ok(report.summary.includes(MSG_NO_STRUCTURED_TOOL_ACTIVITY));
    assertHumanAnchors(r.stderr, "uncertain");
    assert.ok(r.stderr.includes(MSG_NO_STRUCTURED_TOOL_ACTIVITY));
  });

  it("--emit-events with zero exports writes empty file", () => {
    const outReg = join(tmp, "zreg.json");
    const outEv = join(tmp, "zempty.ndjson");
    const inPath = join(tmp, "empty2.json");
    writeFileSync(inPath, "{}", "utf8");
    const r = spawnSync(
      process.execPath,
      [
        cliJs,
        "quick",
        "--input",
        inPath,
        "--db",
        dbPath,
        "--export-registry",
        outReg,
        "--emit-events",
        outEv,
      ],
      { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
    );
    assert.equal(r.status, 2, r.stderr);
    assert.equal(readFileSync(outEv).length, 0);
  });

  it("value mismatch exposes expected/actual and stderr mentions values", async () => {
    const mis = readFileSync(join(root, "test", "fixtures", "quick-verify", "mismatch-line.ndjson"), "utf8");
    const { report } = await runQuickVerify({ inputUtf8: mis, sqlitePath: dbPath });
    assert.equal(report.verdict, "fail");
    const u = report.units.find((x) => x.reasonCodes.includes("VALUE_MISMATCH"));
    assert.ok(u);
    assert.equal(u.verification.expected, '"Alice"');
    assert.equal(u.verification.actual, '"Bob"');
    const outReg = join(tmp, "misreg.json");
    const r = spawnSync(
      process.execPath,
      [
        cliJs,
        "quick",
        "--input",
        join(root, "test", "fixtures", "quick-verify", "mismatch-line.ndjson"),
        "--db",
        dbPath,
        "--export-registry",
        outReg,
      ],
      { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
    );
    assert.equal(r.status, 1);
    assertHumanAnchors(r.stderr, "fail");
    assert.ok(r.stderr.includes('"Alice"'));
    assert.ok(r.stderr.includes('"Bob"'));
  });

  it("ROW_ABSENT failure includes code in stdout and human fragment", async () => {
    const line = readFileSync(join(root, "test", "fixtures", "quick-verify", "absent-line.ndjson"), "utf8");
    const { report } = await runQuickVerify({ inputUtf8: line, sqlitePath: dbPath });
    assert.equal(report.verdict, "fail");
    assert.ok(report.units.some((u) => u.reasonCodes.includes("ROW_ABSENT")));
    const outReg = join(tmp, "absreg.json");
    const r = spawnSync(
      process.execPath,
      [
        cliJs,
        "quick",
        "--input",
        join(root, "test", "fixtures", "quick-verify", "absent-line.ndjson"),
        "--db",
        dbPath,
        "--export-registry",
        outReg,
      ],
      { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
    );
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes("ROW_ABSENT"));
  });

  it("uncertain mapping: verdict uncertain and anchor", async () => {
    const line = readFileSync(join(root, "test", "fixtures", "quick-verify", "duplicate-line.ndjson"), "utf8");
    const { report } = await runQuickVerify({ inputUtf8: line, sqlitePath: dbPath });
    assert.equal(report.verdict, "uncertain");
    assert.ok(report.units.some((u) => u.verdict === "uncertain" && u.reasonCodes.some((c) => c.startsWith("MAPPING_"))));
    const outReg = join(tmp, "dupreg.json");
    const r = spawnSync(
      process.execPath,
      [
        cliJs,
        "quick",
        "--input",
        join(root, "test", "fixtures", "quick-verify", "duplicate-line.ndjson"),
        "--db",
        dbPath,
        "--export-registry",
        outReg,
      ],
      { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
    );
    assert.equal(r.status, 2);
    assertHumanAnchors(r.stderr, "uncertain");
  });

  /**
   * Contract replay: quick exported row tools + synthetic events must match batch verifyWorkflow.
   * Mapping: quick unit verified -> batch step status verified; quick fail missing/inconsistent -> same.
   */
  it("contract replay: batch verifyWorkflow matches quick for exported row", () => {
    const tdir = mkdtempSync(join(tmpdir(), "qv-contract-"));
    try {
      const reg = join(tdir, "reg.json");
      const ev = join(tdir, "ev.ndjson");
      const r1 = spawnSync(
        process.execPath,
        [
          cliJs,
          "quick",
          "--input",
          join(root, "test", "fixtures", "quick-verify", "pass-line.ndjson"),
          "--db",
          dbPath,
          "--export-registry",
          reg,
          "--emit-events",
          ev,
          "--workflow-id",
          "quick-verify",
        ],
        { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
      );
      assert.equal(r1.status, 0, r1.stderr);
      const quickLine = r1.stdout.trim().split("\n").filter(Boolean).pop();
      const quickReport = JSON.parse(quickLine);
      const r2 = spawnSync(
        process.execPath,
        [cliJs, "--workflow-id", "quick-verify", "--events", ev, "--registry", reg, "--db", dbPath],
        { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
      );
      assert.equal(r2.status, 0, r2.stderr);
      const batch = JSON.parse(r2.stdout.trim());
      assert.equal(batch.status, "complete");
      assert.equal(batch.steps.length, quickReport.exportableRegistry.tools.length);
      for (let i = 0; i < batch.steps.length; i++) {
        const st = batch.steps[i].status;
        assert.equal(st, "verified");
      }
    } finally {
      rmSync(tdir, { recursive: true, force: true });
    }
  });

  it("OpenAI-style tool_calls fixture extracts actions and passes", async () => {
    const raw = readFileSync(join(root, "test", "fixtures", "quick-verify", "openai-chat-tool-calls.json"), "utf8");
    const { report } = await runQuickVerify({ inputUtf8: raw, sqlitePath: dbPath });
    assert.ok(report.units.length >= 1);
    assert.equal(report.units[0].sourceAction.toolName, "crm.upsert_contact");
    const v = loadSchemaValidator("quick-verify-report");
    assert.ok(v(report), JSON.stringify(v.errors ?? []));
  });

  it("contract replay: user-outcome fixture is complete with quick:rel verified", () => {
    const tdir = mkdtempSync(join(tmpdir(), "qv-user-contract-"));
    const uo = join(root, "test", "fixtures", "related-exists-export-user-outcome");
    try {
      const dbp = join(tdir, "uo.db");
      const db = new DatabaseSync(dbp);
      db.exec(readFileSync(join(uo, "schema.sql"), "utf8"));
      db.close();
      const reg = join(tdir, "reg.json");
      const ev = join(tdir, "ev.ndjson");
      const r1 = spawnSync(
        process.execPath,
        [
          cliJs,
          "quick",
          "--input",
          join(uo, "input.ndjson"),
          "--db",
          dbp,
          "--export-registry",
          reg,
          "--emit-events",
          ev,
          "--workflow-id",
          "quick-verify",
        ],
        { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
      );
      assert.equal(r1.status, 0, r1.stderr);
      const quickLine = r1.stdout.trim().split("\n").filter(Boolean).pop();
      const quickReport = JSON.parse(quickLine);
      assert.ok(quickReport.exportableRegistry.tools.some((t) => t.toolId.startsWith("quick:rel:")));
      const r2 = spawnSync(
        process.execPath,
        [cliJs, "--workflow-id", "quick-verify", "--events", ev, "--registry", reg, "--db", dbp],
        { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
      );
      assert.equal(r2.status, 0, r2.stderr);
      const batch = JSON.parse(r2.stdout.trim());
      assert.equal(batch.status, "complete");
      assert.equal(batch.steps.length, quickReport.exportableRegistry.tools.length);
      const rel = batch.steps.find((s) => s.toolId.startsWith("quick:rel:"));
      assert.ok(rel);
      assert.equal(rel.status, "verified");
    } finally {
      rmSync(tdir, { recursive: true, force: true });
    }
  });

  it("deterministic quick export bytes for user-outcome fixture", () => {
    const uo = join(root, "test", "fixtures", "related-exists-export-user-outcome");
    const run = () => {
      const tdir = mkdtempSync(join(tmpdir(), "qv-det-"));
      try {
        const dbp = join(tdir, "uo.db");
        const db = new DatabaseSync(dbp);
        db.exec(readFileSync(join(uo, "schema.sql"), "utf8"));
        db.close();
        const reg = join(tdir, "reg.json");
        const ev = join(tdir, "ev.ndjson");
        const r1 = spawnSync(
          process.execPath,
          [
            cliJs,
            "quick",
            "--input",
            join(uo, "input.ndjson"),
            "--db",
            dbp,
            "--export-registry",
            reg,
            "--emit-events",
            ev,
            "--workflow-id",
            "quick-verify",
          ],
          { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
        );
        assert.equal(r1.status, 0, r1.stderr);
        return { reg: readFileSync(reg, "utf8"), ev: readFileSync(ev, "utf8") };
      } finally {
        rmSync(tdir, { recursive: true, force: true });
      }
    };
    const a = run();
    const b = run();
    assert.equal(a.reg, b.reg);
    assert.equal(a.ev, b.ev);
  });

  it("corrupt relational registry yields incomplete batch and INVALID_IDENTIFIER", () => {
    const r = spawnSync(
      process.execPath,
      [
        cliJs,
        "--workflow-id",
        "w-corrupt",
        "--events",
        join(root, "test", "fixtures", "quick-verify", "corrupt-relational-events.ndjson"),
        "--registry",
        join(root, "test", "fixtures", "quick-verify", "corrupt-relational-registry.json"),
        "--db",
        dbPath,
      ],
      { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
    );
    assert.equal(r.status, 2, r.stderr);
    const batch = JSON.parse(r.stdout.trim());
    assert.equal(batch.status, "incomplete");
    assert.equal(batch.steps.length, 1);
    assert.equal(batch.steps[0].status, "incomplete_verification");
    assert.equal(batch.steps[0].reasons[0].code, "INVALID_IDENTIFIER");
  });

  it("tampered synthetic event (__qvFields removed) fails batch resolution", () => {
    const tdir = mkdtempSync(join(tmpdir(), "qv-tamper-"));
    try {
      const reg = join(tdir, "reg.json");
      const ev = join(tdir, "ev.ndjson");
      const r1 = spawnSync(
        process.execPath,
        [
          cliJs,
          "quick",
          "--input",
          join(root, "test", "fixtures", "quick-verify", "pass-line.ndjson"),
          "--db",
          dbPath,
          "--export-registry",
          reg,
          "--emit-events",
          ev,
          "--workflow-id",
          "quick-verify",
        ],
        { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
      );
      assert.equal(r1.status, 0, r1.stderr);
      const bad = JSON.parse(readFileSync(ev, "utf8").trim());
      bad.params = {};
      writeFileSync(ev, `${JSON.stringify(bad)}\n`, "utf8");
      const r2 = spawnSync(
        process.execPath,
        [cliJs, "--workflow-id", "quick-verify", "--events", ev, "--registry", reg, "--db", dbPath],
        { encoding: "utf8", cwd: root, maxBuffer: 10_000_000 },
      );
      assert.notEqual(r2.status, 0);
    } finally {
      rmSync(tdir, { recursive: true, force: true });
    }
  });
});
