#!/usr/bin/env node
/**
 * Onboarding driver — invoke via `npm start` or `npm run first-run` (runs build, then this file).
 *
 * Stdout layout (in order):
 * 1. Banner + prerequisite explanation (plain language).
 * 2. Case 1 narrative → human verification report → WorkflowResult JSON → key takeaways.
 * 3. Case 2 narrative → human verification report → WorkflowResult JSON → key takeaways.
 *
 * Human reports are written to stdout (via truthReport) so one stream shows story + diagnosis.
 * Self-check (exit 1 if fail): workflow outcomes; combined stdout must contain
 * "complete", "inconsistent", and "ROW_ABSENT" (case-sensitive).
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

function assertMinNode() {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(process.versions.node);
  if (!m) fail("Could not parse Node.js version.");
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major < 22 || (major === 22 && minor < 13)) {
    fail(
      "Node.js >= 22.13 is required (built-in node:sqlite). See README.md Requirements. Current: " +
        process.versions.node,
    );
  }
}

assertMinNode();

const seedSql = readFileSync(seedPath, "utf8");
if (existsSync(dbPath)) {
  unlinkSync(dbPath);
}
const db = new DatabaseSync(dbPath);
db.exec(seedSql);
db.close();

const verifyOpts = {
  eventsPath,
  registryPath,
  database: { kind: "sqlite", path: dbPath },
  logStep: () => {},
  truthReport: (report) => {
    println("");
    println("--- Human verification report ---");
    println(report);
  },
};

println("workflow-verifier — first run");
println("");
println(
  "We compare structured tool observations against read-only SQL—because an agent saying “done” is not proof a row exists with the right values.",
);
println(
  "Example 1: observations and DB agree. Example 2: the activity implies a contact write, but that row is missing—a gap traces alone often miss.",
);
println("");

println("[1/2] Workflow wf_complete — expected: DB contains the contact row the structured observation describes.");
println(
  "The NDJSON line records crm.upsert_contact for id c_ok (Alice, active). The seeded SQLite DB has that row. Actual: verification should report complete / verified.",
);
println("");

const r1 = await verifyWorkflow({
  ...verifyOpts,
  workflowId: "wf_complete",
});
println(JSON.stringify(r1));
const s1 = r1.steps[0];
println(
  `Key takeaways: workflow.status=${r1.status}; first step.status=${s1?.status ?? "n/a"}; this run matched the database.`,
);

if (r1.status !== "complete") fail(`Expected wf_complete workflow status complete, got ${r1.status}`);
if (!s1 || s1.status !== "verified") {
  fail(`Expected wf_complete first step verified, got ${s1?.status ?? "missing step"}`);
}

println("");
println("[2/2] Workflow wf_missing — expected: same observation shape, but the DB has no row for that id.");
println(
  "The observation records crm.upsert_contact for missing_id as if the write succeeded. Actual: no contacts row for missing_id—verification should flag inconsistent / missing with ROW_ABSENT in the JSON (see human report for plain wording).",
);
println("");

const r2 = await verifyWorkflow({
  ...verifyOpts,
  workflowId: "wf_missing",
});
println(JSON.stringify(r2));
const s2 = r2.steps[0];
const code0 = s2?.reasons[0]?.code ?? "n/a";
println(
  `Key takeaways: workflow.status=${r2.status}; first step.status=${s2?.status ?? "n/a"}; first reason.code=${code0} (row absent in DB).`,
);

if (r2.status !== "inconsistent") {
  fail(`Expected wf_missing workflow status inconsistent, got ${r2.status}`);
}
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
