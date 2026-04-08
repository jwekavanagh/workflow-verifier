/**
 * One-shot: recompute workflowTruthReport from engine fields (adds observedStateSummary, schemaVersion 9).
 * Run after `npm run build`: node scripts/migrate-workflow-truth-v9.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = pathToFileURL(join(root, "dist/workflowResultNormalize.js")).href;
const distTruth = pathToFileURL(join(root, "dist/workflowTruthReport.js")).href;
const { workflowEngineResultFromEmitted } = await import(dist);
const { buildWorkflowTruthReport } = await import(distTruth);

const REL_PATHS = [
  "examples/debug-corpus/run_ok/workflow-result.json",
  "test/fixtures/signed-bundle-v2/workflow-result.json",
  "test/fixtures/debug-ui-compare/run_a/workflow-result.json",
  "test/fixtures/debug-ui-compare/run_b/workflow-result.json",
  "test/fixtures/debug-ui-compare/run_path_empty/workflow-result.json",
  "test/fixtures/debug-ui-compare/run_path_nonempty/workflow-result.json",
  "test/golden/wf_multi_ok.stdout.json",
  "test/golden/wf_multi_partial.stdout.json",
  "test/golden/wf_multi_all_fail.stdout.json",
  "test/fixtures/wf_inconsistent_result.json",
];

for (const rel of REL_PATHS) {
  const path = join(root, rel);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  const wf = JSON.parse(raw);
  if (!wf.workflowTruthReport || !Array.isArray(wf.steps)) continue;
  const engine = workflowEngineResultFromEmitted(wf);
  wf.workflowTruthReport = buildWorkflowTruthReport(engine);
  writeFileSync(path, `${JSON.stringify(wf)}\n`);
  console.log("patched", rel);
}
