import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("docs SSOT execution-truth row verification", () => {
  it("workflow-verifier.md anchors row-absent and v14 migration vocabulary", () => {
    const md = readFileSync(join(root, "docs", "workflow-verifier.md"), "utf8").replace(/\r\n/g, "\n");
    expect(md).toContain("## SSOT contract boundary (normative)");
    for (const s of [
      "sql_row_absent",
      "ROW_PRESENT_WHEN_FORBIDDEN",
      "FORBIDDEN_ROWS_STILL_PRESENT_WITHIN_WINDOW",
      "identityEq",
      "Consumer migration: stdout `WorkflowResult` v14",
      "canonicalEqKey",
    ]) {
      expect(md).toContain(s);
    }
  });
});
