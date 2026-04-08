/**
 * SSOT: relational semantics and reason codes live only in docs/relational-verification.md.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const CODES = ["RELATED_ROWS_ABSENT", "RELATIONAL_EXPECTATION_MISMATCH", "RELATIONAL_SCALAR_UNUSABLE"];

describe("docs relational SSOT", () => {
  it("(i)-(ii) README and workflow-verifier omit relational reason code literals", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const etl = readFileSync(join(root, "docs", "workflow-verifier.md"), "utf8");
    for (const c of CODES) {
      assert.equal(readme.includes(c), false, `README must not contain ${c}`);
      assert.equal(etl.includes(c), false, `workflow-verifier must not contain ${c}`);
    }
  });

  it("(iii) pointer to relational-verification.md", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const etl = readFileSync(join(root, "docs", "workflow-verifier.md"), "utf8");
    assert.match(readme, /relational-verification\.md/);
    assert.match(etl, /relational-verification\.md/);
  });

  it("(iv) SSOT doc contains code literals and structural-only", () => {
    const rel = readFileSync(join(root, "docs", "relational-verification.md"), "utf8");
    for (const c of CODES) {
      assert.ok(rel.includes(c), `relational-verification.md must contain ${c}`);
    }
    assert.ok(rel.includes("structural-only"));
  });
});
