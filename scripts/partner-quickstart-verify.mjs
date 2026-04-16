#!/usr/bin/env node
/**
 * Partner quickstart: seed DB and run wf_partner verification against examples/partner-quickstart/.
 * SQLite (default): temp DB under os.tmpdir().
 * Postgres: set PARTNER_POSTGRES_URL (full DDL-capable URL for seed).
 */
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function assertMinNode() {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(process.versions.node);
  if (!m) fail("Could not parse Node.js version.");
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major < 22 || (major === 22 && minor < 13)) {
    fail(
      "Node.js >= 22.13 is required. Current: " + process.versions.node,
    );
  }
}

const partnerDir = path.join(root, "examples", "partner-quickstart");
const eventsPath = path.join(partnerDir, "partner.events.ndjson");
const registryPath = path.join(partnerDir, "partner.tools.json");
const seedPath = path.join(partnerDir, "partner.seed.sql");
const cliPath = path.join(root, "dist", "cli.js");
const goldenLockPath = path.join(partnerDir, "partner.ci-lock-v1.json");

for (const p of [eventsPath, registryPath, seedPath, cliPath, goldenLockPath]) {
  if (!existsSync(p)) fail(`Missing required file: ${p} (run npm run build from repo root if dist/cli.js is missing)`);
}

const seedSql = readFileSync(seedPath, "utf8");
const workflowId = "wf_partner";

function runCli(dbArg, extraArgs = []) {
  const args = [
    cliPath,
    "--workflow-id",
    workflowId,
    "--events",
    eventsPath,
    "--registry",
    registryPath,
    ...dbArg,
    ...extraArgs,
  ];
  const r = spawnSync(process.execPath, args, {
    encoding: "utf8",
    cwd: root,
    env: process.env,
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** OSS output-lock under mkdtemp must match committed golden (read-only in automation). */
function assertOutputLockMatchesGolden(dbArg) {
  if (!existsSync(goldenLockPath)) {
    fail(`Missing golden ci-lock: ${goldenLockPath}`);
  }
  const lockTmp = path.join(tmpdir(), `partner-ci-lock-${randomUUID()}.json`);
  const r = runCli(dbArg, ["--no-truth-report", "--output-lock", lockTmp]);
  try {
    if (r.status !== 0) {
      console.error(r.stderr);
      fail(`output-lock verify exited ${r.status}`);
    }
    const got = readFileSync(lockTmp);
    const want = readFileSync(goldenLockPath);
    if (got.length !== want.length || !got.equals(want)) {
      fail("ci-lock bytes differ from examples/partner-quickstart/partner.ci-lock-v1.json");
    }
  } finally {
    try {
      unlinkSync(lockTmp);
    } catch {
      /* ignore */
    }
  }
}

function assertVerified(stdout) {
  let obj;
  try {
    obj = JSON.parse(stdout.trim());
  } catch {
    fail("CLI stdout is not JSON: " + stdout.slice(0, 200));
  }
  if (obj.status !== "complete") fail("Expected workflow status complete, got: " + JSON.stringify(obj.status));
  const step0 = obj.steps?.[0];
  if (!step0 || step0.status !== "verified") {
    fail("Expected first step verified, got: " + JSON.stringify(step0));
  }
}

/** After success: replay CLI stderr, then stdout (each with trailing newline), then driver tail line. */
function emitSuccessReplay(r, mode) {
  if (r.stderr) {
    process.stderr.write(r.stderr.endsWith("\n") ? r.stderr : r.stderr + "\n");
  }
  if (r.stdout) {
    process.stdout.write(r.stdout.endsWith("\n") ? r.stdout : r.stdout + "\n");
  }
  console.log(`first-run-verify: ok (${mode})`);
}

async function main() {
  assertMinNode();

  const pgUrl = process.env.PARTNER_POSTGRES_URL?.trim();

  if (pgUrl) {
    const client = new pg.Client({ connectionString: pgUrl });
    try {
      await client.connect();
      await client.query(seedSql);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fail("Postgres seed failed: " + msg);
    } finally {
      await client.end().catch(() => {});
    }
    const r = runCli(["--postgres-url", pgUrl]);
    if (r.status !== 0) {
      console.error(r.stderr);
      fail("CLI exited " + r.status);
    }
    assertVerified(r.stdout);
    assertOutputLockMatchesGolden(["--postgres-url", pgUrl]);
    emitSuccessReplay(r, "postgres");
  } else {
    const dbFile = path.join(tmpdir(), `wf-partner-${randomUUID()}.db`);
    try {
      const db = new DatabaseSync(dbFile);
      try {
        db.exec(seedSql);
      } finally {
        db.close();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fail("SQLite seed failed: " + msg);
    }
    const r = runCli(["--db", dbFile]);
    if (r.status !== 0) {
      console.error(r.stderr);
      fail("CLI exited " + r.status);
    }
    assertVerified(r.stdout);
    assertOutputLockMatchesGolden(["--db", dbFile]);
    try {
      unlinkSync(dbFile);
    } catch {
      /* ignore */
    }
    emitSuccessReplay(r, "sqlite");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
