/**
 * quick-verify-normative links to enforce stream SSOT; no duplicate exit-4 table row.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const quick = readFileSync(join(root, "docs", "quick-verify-normative.md"), "utf8");

describe("quick-verify normative enforce cross-link", () => {
  it("links to enforce stream contract anchor only (no local exit 4 table row)", () => {
    assert.ok(
      quick.includes("workflow-verifier.md#enforce-stream-contract-normative"),
      "must link to workflow-verifier enforce stream anchor",
    );
    assert.equal(
      /\|\s*4\s*\|\s*`?enforce/.test(quick),
      false,
      "must not define a markdown table row for exit 4 + enforce locally",
    );
  });
});
