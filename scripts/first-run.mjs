#!/usr/bin/env node
/**
 * Onboarding driver — invoke only via: npm run first-run (runs build, then this file).
 *
 * Fixed newcomer-facing stdout lines (in order):
 * 1. "Execution Truth Layer — first verification"
 * 2. "[1/2] Workflow wf_complete (success case): you should see workflow status complete and step status verified."
 * 3. "<JSON for wf_complete>"
 * 4. "Outcome check: this run demonstrates a successful verification (status complete, step verified)."
 * 5. "[2/2] Workflow wf_missing (failure case): you should see workflow status inconsistent, step missing, reason ROW_ABSENT."
 * 6. "<JSON for wf_missing>"
 * 7. "Outcome check: this run demonstrates a failed verification against ground truth (status inconsistent, reason ROW_ABSENT)."
 *
 * Self-check (exit 1 if fail): workflow outcomes per plan; combined printed text must contain
 * the substrings "complete", "inconsistent", and "ROW_ABSENT" (case-sensitive).
 *
 * stderr: two human truth reports (one per verifyWorkflow call), emitted by default truthReport.
 * stdout: fixed narrative lines and JSON per workflow (unchanged self-check).
 */
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { verifyWorkflow } from "../dist/pipeline.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const seedPath = join(root, "examples", "seed.sql");
const eventsPath = join(root, "examples", "events.ndjson");
const registryPath = join(root, "examples", "tools.json");
const dbPath = join(root, "examples", "demo.db");

/** @type {string[]} */
const printed = [];

function println(line) {
  console.log(line);
  printed.push(line);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const seedSql = readFileSync(seedPath, "utf8");
if (existsSync(dbPath)) {
  unlinkSync(dbPath);
}
const db = new DatabaseSync(dbPath);
db.exec(seedSql);
db.close();

println("Execution Truth Layer — first verification");

println(
  "[1/2] Workflow wf_complete (success case): you should see workflow status complete and step status verified.",
);
const r1 = await verifyWorkflow({
  workflowId: "wf_complete",
  eventsPath,
  registryPath,
  database: { kind: "sqlite", path: dbPath },
});
println(JSON.stringify(r1));
println(
  "Outcome check: this run demonstrates a successful verification (status complete, step verified).",
);

if (r1.status !== "complete") fail(`Expected wf_complete workflow status complete, got ${r1.status}`);
const s1 = r1.steps[0];
if (!s1 || s1.status !== "verified") {
  fail(`Expected wf_complete first step verified, got ${s1?.status ?? "missing step"}`);
}

println(
  "[2/2] Workflow wf_missing (failure case): you should see workflow status inconsistent, step missing, reason ROW_ABSENT.",
);
const r2 = await verifyWorkflow({
  workflowId: "wf_missing",
  eventsPath,
  registryPath,
  database: { kind: "sqlite", path: dbPath },
});
println(JSON.stringify(r2));
println(
  "Outcome check: this run demonstrates a failed verification against ground truth (status inconsistent, reason ROW_ABSENT).",
);

if (r2.status !== "inconsistent") {
  fail(`Expected wf_missing workflow status inconsistent, got ${r2.status}`);
}
const s2 = r2.steps[0];
if (!s2 || s2.status !== "missing") {
  fail(`Expected wf_missing first step missing, got ${s2?.status ?? "missing step"}`);
}
const code = s2.reasons[0]?.code;
if (code !== "ROW_ABSENT") {
  fail(`Expected wf_missing first reason ROW_ABSENT, got ${code ?? "none"}`);
}

const combined = printed.join("\n");
for (const token of ["complete", "inconsistent", "ROW_ABSENT"]) {
  if (!combined.includes(token)) {
    fail(`Self-check failed: stdout must contain substring "${token}"`);
  }
}

process.exit(0);
