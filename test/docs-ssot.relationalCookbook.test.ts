import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Must match docs/workflow-verifier.md verbatim (Integrator section). */
const NORMATIVE_COOKBOOK_POINTER =
  "Relational check authoring and the mapping from product vocabulary to registry checkKind values are normative only in [relational-verification.md](relational-verification.md#invariant-cookbook-product-vocabulary).";

describe("docs SSOT relational cookbook", () => {
  it("relational-verification.md has cookbook heading and vocabulary labels", () => {
    const md = readFileSync(join(root, "docs", "relational-verification.md"), "utf8").replace(/\r\n/g, "\n");
    expect(md).toContain("## Invariant cookbook (product vocabulary)");
    for (const s of [
      "exists_related",
      "composite_exists_related",
      "orphan_rows",
      "anti_join",
      "matchEq",
      "ORPHAN_ROW_DETECTED",
      "count_equals",
      "count_gte",
      "aggregate_match",
      "join_cardinality",
      "example.sql_relational_sum",
    ]) {
      expect(md).toContain(s);
    }
  });

  it("workflow-verifier.md contains the normative cookbook pointer sentence", () => {
    const md = readFileSync(join(root, "docs", "workflow-verifier.md"), "utf8").replace(/\r\n/g, "\n");
    expect(md).toContain(NORMATIVE_COOKBOOK_POINTER);
  });
});
