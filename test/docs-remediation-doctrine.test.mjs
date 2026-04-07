/**
 * Module D: marker-delimited remediation doctrine in execution-truth-layer.md.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const MARKER_EVIDENCE_OPEN = "<!-- etl:remediation-doctrine:evidence-order -->";
const MARKER_EVIDENCE_CLOSE = "<!-- /etl:remediation-doctrine:evidence-order -->";
const MARKER_SENTINEL_OPEN = "<!-- etl:remediation-doctrine:compare-sentinel -->";
const MARKER_SENTINEL_CLOSE = "<!-- /etl:remediation-doctrine:compare-sentinel -->";
const MARKER_DATA_OPEN = "<!-- etl:remediation-doctrine:data-only -->";
const MARKER_DATA_CLOSE = "<!-- /etl:remediation-doctrine:data-only -->";

const PAIR1_SUBSTRINGS = [
  "failureAnalysis.evidence",
  "deriveActionableCategory",
  "deriveActionableFailureWorkflow",
  "actionableFailure.ts",
  "contradict",
];

const PAIR2_SUBSTRINGS = [
  "perRunActionableFailures",
  "rectangular",
  "perRunActionableFromWorkflowResult",
  "`none`",
  "automationSafe",
];

const PAIR3_SUBSTRINGS = [
  "verification",
  "mutation",
  "external",
  "recommendedAction",
  "subprocesses",
];

function innerBetween(md, open, close, label) {
  const i = md.indexOf(open);
  assert.ok(i >= 0, `missing open marker: ${label}`);
  const j = md.indexOf(close, i + open.length);
  assert.ok(j >= 0, `missing close marker: ${label}`);
  return md.slice(i + open.length, j);
}

describe("docs remediation doctrine (Module D)", () => {
  it("execution-truth-layer.md marker blocks contain required substrings", () => {
    const md = readFileSync(join(root, "docs", "execution-truth-layer.md"), "utf8");

    const inner1 = innerBetween(md, MARKER_EVIDENCE_OPEN, MARKER_EVIDENCE_CLOSE, "evidence-order");
    assert.ok(inner1.trim().length >= 80, "evidence-order block too short");
    for (const s of PAIR1_SUBSTRINGS) {
      assert.ok(inner1.includes(s), `evidence-order missing: ${s}`);
    }

    const inner2 = innerBetween(md, MARKER_SENTINEL_OPEN, MARKER_SENTINEL_CLOSE, "compare-sentinel");
    assert.ok(inner2.trim().length >= 80, "compare-sentinel block too short");
    for (const s of PAIR2_SUBSTRINGS) {
      assert.ok(inner2.includes(s), `compare-sentinel missing: ${s}`);
    }

    const inner3 = innerBetween(md, MARKER_DATA_OPEN, MARKER_DATA_CLOSE, "data-only");
    assert.ok(inner3.trim().length >= 80, "data-only block too short");
    for (const s of PAIR3_SUBSTRINGS) {
      assert.ok(inner3.includes(s), `data-only missing: ${s}`);
    }

    assert.ok(
      md.indexOf(MARKER_EVIDENCE_OPEN) < md.indexOf(MARKER_SENTINEL_OPEN),
      "marker order: evidence before sentinel",
    );
    assert.ok(
      md.indexOf(MARKER_SENTINEL_OPEN) < md.indexOf(MARKER_DATA_OPEN),
      "marker order: sentinel before data-only",
    );
  });
});
