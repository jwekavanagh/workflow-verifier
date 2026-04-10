#!/usr/bin/env node
/**
 * Fails fast when the web demo cannot run: Node version, node:sqlite, examples fixtures.
 * Exit 0 = prerequisites satisfied; exit 1 = not.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseNodeMajorMinorPatch(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function nodeAtLeast_22_13() {
  const p = parseNodeMajorMinorPatch(process.version);
  if (!p) return false;
  if (p.major > 22) return true;
  if (p.major < 22) return false;
  if (p.minor > 13) return true;
  if (p.minor < 13) return false;
  return p.patch >= 0;
}

function committedExampleFixturesPresent(dir) {
  return (
    existsSync(path.join(dir, "events.ndjson")) &&
    existsSync(path.join(dir, "tools.json")) &&
    existsSync(path.join(dir, "seed.sql"))
  );
}

function resolveExamplesDir() {
  const candidates = [path.join(process.cwd(), "examples"), path.join(process.cwd(), "..", "examples")];
  for (const dir of candidates) {
    if (committedExampleFixturesPresent(dir)) return dir;
  }
  return null;
}

function fail(msg) {
  console.error(`check-web-demo-prereqs: ${msg}`);
  process.exit(1);
}

if (!nodeAtLeast_22_13()) {
  fail(`Node >= 22.13.0 required for web demo (got ${process.version})`);
}

try {
  await import("node:sqlite");
} catch (e) {
  fail(`node:sqlite not available: ${e instanceof Error ? e.message : e}`);
}

const { DatabaseSync } = await import("node:sqlite");

function ensureExamplesDemoDb(dir) {
  const demoDb = path.join(dir, "demo.db");
  if (existsSync(demoDb)) return;
  const sql = readFileSync(path.join(dir, "seed.sql"), "utf8");
  try {
    const db = new DatabaseSync(demoDb);
    db.exec(sql);
    db.close();
  } catch (e) {
    if (existsSync(demoDb)) return;
    throw e;
  }
}

const examplesDir = resolveExamplesDir();
if (!examplesDir) {
  fail(
    "examples/ not found (expected events.ndjson, tools.json, seed.sql under examples/ from cwd or parent)",
  );
}

ensureExamplesDemoDb(examplesDir);

const required = ["events.ndjson", "tools.json", "demo.db"];
for (const f of required) {
  const p = path.join(examplesDir, f);
  if (!existsSync(p)) fail(`missing fixture ${p}`);
}

const dbPath = path.join(examplesDir, "demo.db");
let db;
try {
  db = new DatabaseSync(dbPath, { readOnly: true });
} catch (e) {
  fail(`cannot open ${dbPath}: ${e instanceof Error ? e.message : e}`);
}
try {
  db.exec("SELECT 1");
} finally {
  try {
    db.close();
  } catch {
    /* ignore */
  }
}

console.log("check-web-demo-prereqs: ok");
process.exit(0);
