import { describe, expect, it } from "vitest";
import { buildRelationalScalarSql } from "./relationalInvariant.js";
import type { ResolvedRelationalCheck } from "./types.js";

const relatedExistsWithTwoWhere: ResolvedRelationalCheck = {
  checkKind: "related_exists",
  id: "chk",
  childTable: "rel_lines",
  fkColumn: "order_id",
  fkValue: "o1",
  whereEq: [
    { column: "sku", value: "sku_a" },
    { column: "id", value: "l1" },
  ],
};

describe("buildRelationalScalarSql related_exists whereEq", () => {
  it("buildRelationalScalarSql sqlite: related_exists whereEq uses ? placeholders only", () => {
    const { text, values } = buildRelationalScalarSql("sqlite", relatedExistsWithTwoWhere);
    expect(values.length).toBe(3);
    expect(text.split("?").length - 1).toBe(values.length);
    for (const v of values) {
      expect(text.includes(v)).toBe(false);
    }
    expect(text).toContain("EXISTS");
  });

  it("buildRelationalScalarSql postgres: related_exists whereEq uses $1..$N and binds outside text", () => {
    const { text, values } = buildRelationalScalarSql("postgres", relatedExistsWithTwoWhere);
    expect(values.length).toBe(3);
    for (const v of values) {
      expect(text.includes(v)).toBe(false);
    }
    expect(text).toMatch(/\$1\b[\s\S]*\$2\b[\s\S]*\$3\b/);
  });
});
