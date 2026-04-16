/**
 * Marker-delimited enforce stream contract in agentskeptic.md
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const md = readFileSync(join(root, "docs", "agentskeptic.md"), "utf8");

const OPEN = "<!-- etl:enforce-stream-contract:start -->";
const CLOSE = "<!-- etl:enforce-stream-contract:end -->";

describe("docs enforce stream contract marker", () => {
  it("marker block contains required substrings", () => {
    const i = md.indexOf(OPEN);
    assert.ok(i >= 0, "missing open marker");
    const j = md.indexOf(CLOSE, i + OPEN.length);
    assert.ok(j >= 0, "missing close marker");
    const inner = md.slice(i + OPEN.length, j);
    for (const s of [
      "compare-only",
      "batch verify",
      "enforce batch",
      "enforce quick",
      "JSON.stringify(result)",
      "stableStringify(report)",
      "VERIFICATION_OUTPUT_LOCK_MISMATCH",
      "--no-truth-report",
    ]) {
      assert.ok(inner.includes(s), `missing substring: ${s}`);
    }
  });
});
