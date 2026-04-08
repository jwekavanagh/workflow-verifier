/**
 * Normative WorkflowResult v15 prose in docs/workflow-verifier.md (CI-delimited regions).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const etlPath = join(root, "docs", "workflow-verifier.md");
const workflowResultSchemaPath = join(root, "schemas", "workflow-result.schema.json");

const SEGMENT_RE = /<!-- ci:workflow-result-normative-prose:start -->([\s\S]*?)<!-- ci:workflow-result-normative-prose:end -->/g;

const FORBIDDEN_BACKTICK_13 = /schemaVersion[\s\S]{0,200}?`13`/;
const FORBIDDEN_BOLD_13 = /schemaVersion[\s\S]{0,200}?\*\*13\*\*/;
const FORBIDDEN_BACKTICK_14 = /schemaVersion[\s\S]{0,200}?`14`/;
const FORBIDDEN_BOLD_14 = /schemaVersion[\s\S]{0,200}?\*\*14\*\*/;

/** Must each appear at least once in the concatenated normative segments (after joining). */
const REQUIRED_PHRASES = [
  "`schemaVersion` **`15`**",
  "**`schemaVersion`** **15**",
  "outer **`schemaVersion` 15**",
  "`finalizeEmittedWorkflowResult` attaches the truth report and sets **`WorkflowResult.schemaVersion` 15**",
];

const MARKER_15 = "<!-- ci:normative-workflow-result-schemaVersion:15 -->";

describe("docs workflow-result normative prose (v15)", () => {
  it("workflow-result.schema.json const is 15", () => {
    const j = JSON.parse(readFileSync(workflowResultSchemaPath, "utf8"));
    assert.strictEqual(j.properties?.schemaVersion?.const, 15);
  });

  it("ETL doc contains schemaVersion:15 anchor comment", () => {
    const doc = readFileSync(etlPath, "utf8");
    assert.ok(doc.includes(MARKER_15), "missing ci:normative-workflow-result-schemaVersion:15 marker");
  });

  it("normative segments forbid stale WorkflowResult stdout schemaVersion 13 coupling", () => {
    const doc = readFileSync(etlPath, "utf8");
    const segments = [];
    let m;
    SEGMENT_RE.lastIndex = 0;
    while ((m = SEGMENT_RE.exec(doc)) !== null) {
      segments.push(m[1]);
    }
    assert.ok(segments.length >= 1, "no workflow-result-normative-prose segments found");
    const combined = segments.join("\n");
    for (const phrase of REQUIRED_PHRASES) {
      assert.ok(
        combined.includes(phrase),
        `required normative phrase missing: ${JSON.stringify(phrase)}`,
      );
    }
    assert.equal(FORBIDDEN_BACKTICK_13.test(combined), false, "normative region must not pair schemaVersion with `13`");
    assert.equal(FORBIDDEN_BOLD_13.test(combined), false, "normative region must not pair schemaVersion with **13**");
    assert.equal(FORBIDDEN_BACKTICK_14.test(combined), false, "normative region must not pair schemaVersion with `14`");
    assert.equal(FORBIDDEN_BOLD_14.test(combined), false, "normative region must not pair schemaVersion with **14**");
  });
});
