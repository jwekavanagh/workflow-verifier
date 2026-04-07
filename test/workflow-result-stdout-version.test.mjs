/**
 * Enforces WorkflowResult stdout schemaVersion 14 alignment across schema + sources + checklist files.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

describe("WorkflowResult stdout schemaVersion 14", () => {
  it("workflow-result.schema.json const is 14", () => {
    const schema = JSON.parse(readFileSync(join(root, "schemas", "workflow-result.schema.json"), "utf8"));
    assert.equal(schema.properties.schemaVersion.const, 14);
  });

  it("finalizeEmittedWorkflowResult sets schemaVersion 14 exactly once", () => {
    const src = readFileSync(join(root, "src", "workflowTruthReport.ts"), "utf8");
    const fnStart = src.indexOf("export function finalizeEmittedWorkflowResult");
    assert.ok(fnStart >= 0);
    const fnExcerpt = src.slice(fnStart, fnStart + 800);
    const matches = [...fnExcerpt.matchAll(/schemaVersion:\s*14/g)];
    assert.equal(matches.length, 1, "expected single schemaVersion: 14 in finalizeEmittedWorkflowResult");
  });

  it("WorkflowResult type documents 14", () => {
    const src = readFileSync(join(root, "src", "types.ts"), "utf8");
    assert.match(src, /schemaVersion:\s*14/);
  });

  it("checklist files do not pin stdout schema to 11", () => {
    const paths = [
      join(root, "test", "pipeline.sqlite.test.mjs"),
      join(root, "test", "pipeline.postgres.test.mjs"),
      join(root, "test", "ci-workflow-truth-postgres-contract.test.mjs"),
      join(root, "test", "workflow-result-consumer-contract.test.mjs"),
      join(root, "src", "agentRunRecord.test.ts"),
    ];
    const bad = [
      /schemaVersion,\s*11/,
      /"schemaVersion":\s*11/,
      /assert\.equal\([^)]*schemaVersion[^,]*,\s*11\)/,
    ];
    for (const p of paths) {
      const text = readFileSync(p, "utf8");
      for (const re of bad) {
        assert.equal(re.test(text), false, `${p} must not match ${re}`);
      }
    }
  });
});
