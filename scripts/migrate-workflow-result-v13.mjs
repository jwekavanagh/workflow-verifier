/**
 * Upgrade saved WorkflowResult JSON from schemaVersion 12 → 13 by recomputing workflowTruthReport
 * (includes actionableFailure.recommendedAction / automationSafe and truth schemaVersion 6).
 *
 * Scans JSON under test/golden, test/fixtures, examples (excluding examples/debug-corpus and corpus-negative).
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = (name) => pathToFileURL(join(root, "dist", name)).href;
const { workflowEngineResultFromEmitted } = await import(dist("workflowResultNormalize.js"));
const { finalizeEmittedWorkflowResult } = await import(dist("workflowTruthReport.js"));

const ROOTS = [join(root, "test", "golden"), join(root, "test", "fixtures"), join(root, "examples")];

function shouldMigrateFile(fp) {
  const rel = fp.replace(/\\/g, "/");
  if (rel.includes("/corpus-negative/")) return false;
  if (rel.includes("/examples/debug-corpus/")) return false;
  return true;
}

function walkJsonFiles(dir, out) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkJsonFiles(p, out);
    else if (st.isFile() && name.endsWith(".json")) out.push(p);
  }
}

function needsBump(j) {
  return j && typeof j === "object" && j.schemaVersion === 12 && Array.isArray(j.steps);
}

const files = [];
for (const r of ROOTS) walkJsonFiles(r, files);

let migrated = 0;
for (const fp of files) {
  if (!shouldMigrateFile(fp)) continue;
  let raw;
  try {
    raw = readFileSync(fp, "utf8");
  } catch {
    continue;
  }
  let j;
  try {
    j = JSON.parse(raw);
  } catch {
    continue;
  }
  if (!needsBump(j)) continue;
  const outObj = finalizeEmittedWorkflowResult(workflowEngineResultFromEmitted(j));
  const out = `${JSON.stringify(outObj)}${raw.endsWith("\n") ? "\n" : ""}`;
  writeFileSync(fp, out);
  console.log("migrated", fp);
  migrated += 1;
}

if (migrated === 0) {
  console.log("migrate-workflow-result-v13: no schemaVersion 12 workflow-result-shaped files found");
}
