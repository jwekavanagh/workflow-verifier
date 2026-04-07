import { describe, expect, it } from "vitest";
import { buildRelationalScalarSql } from "./relationalInvariant.js";
import type { ResolvedRelationalCheck } from "./types.js";

const relatedExistsWithMatchEq: ResolvedRelationalCheck = {
  checkKind: "related_exists",
  id: "chk",
  childTable: "rel_lines",
  matchEq: [
    { column: "order_id", value: "o1" },
    { column: "sku", value: "sku_a" },
    { column: "id", value: "l1" },
  ],
};

describe("buildRelationalScalarSql related_exists matchEq", () => {
  it("buildRelationalScalarSql sqlite: related_exists matchEq uses ? placeholders only", () => {
    const { text, values } = buildRelationalScalarSql("sqlite", relatedExistsWithMatchEq);
    expect(values.length).toBe(3);
    expect(text.split("?").length - 1).toBe(values.length);
    for (const v of values) {
      expect(text.includes(v)).toBe(false);
    }
    expect(text).toContain("EXISTS");
  });

  it("buildRelationalScalarSql postgres: related_exists matchEq uses $1..$N and binds outside text", () => {
    const { text, values } = buildRelationalScalarSql("postgres", relatedExistsWithMatchEq);
    expect(values.length).toBe(3);
    for (const v of values) {
      expect(text.includes(v)).toBe(false);
    }
    expect(text).toMatch(/\$1\b[\s\S]*\$2\b[\s\S]*\$3\b/);
  });
});
