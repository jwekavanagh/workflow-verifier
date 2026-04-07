import { describe, expect, it } from "vitest";
import { buildRegistryMap, resolveVerificationRequest } from "./resolveExpectation.js";
import type { ToolRegistryEntry } from "./types.js";
import { CLI_OPERATIONAL_CODES } from "./failureCatalog.js";
import { TruthLayerError } from "./truthLayerError.js";

const baseEntry: ToolRegistryEntry = {
  toolId: "t",
  effectDescriptionTemplate: "x",
  verification: {
    kind: "sql_row",
    table: { const: "contacts" },
    identityEq: [{ column: { const: "id" }, value: { const: "1" } }],
    requiredFields: { pointer: "/fields" },
  },
};

describe("resolveVerificationRequest requiredFields scalars", () => {
  it("resolves null and number in fields object", () => {
    const r = resolveVerificationRequest(baseEntry, {
      fields: { name: null, qty: 7 },
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.verificationKind === "sql_row") {
      expect(r.request.requiredFields).toEqual({ name: null, qty: 7 });
    }
  });

  it("resolves boolean and string", () => {
    const r = resolveVerificationRequest(baseEntry, {
      fields: { active: true, label: "hi" },
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.verificationKind === "sql_row") {
      expect(r.request.requiredFields).toEqual({ active: true, label: "hi" });
    }
  });

  it("rejects nested object field value", () => {
    const r = resolveVerificationRequest(baseEntry, {
      fields: { bad: { x: 1 } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("REQUIRED_FIELDS_VALUE_NOT_SCALAR");
      expect(r.message).toBe("requiredFields.bad must be string, number, boolean, or null");
    }
  });

  it("rejects undefined field value", () => {
    const r = resolveVerificationRequest(baseEntry, {
      fields: { u: undefined },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("REQUIRED_FIELDS_VALUE_UNDEFINED");
      expect(r.message).toBe("requiredFields.u must not be undefined");
    }
  });
});

describe("resolver code catalog", () => {
  it("CONST_STRING_EMPTY", () => {
    const entry = {
      ...baseEntry,
      verification: {
        kind: "sql_row" as const,
        table: { const: "contacts" },
        identityEq: [{ column: { const: "" }, value: { const: "1" } }],
        requiredFields: { pointer: "/fields" },
      },
    } as ToolRegistryEntry;
    const r = resolveVerificationRequest(entry, { fields: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("CONST_STRING_EMPTY");
      expect(r.message).toBe("identityEq[0].column: const must be non-empty string");
    }
  });

  it("STRING_SPEC_POINTER_MISSING", () => {
    const r = resolveVerificationRequest(
      {
        ...baseEntry,
        verification: {
          kind: "sql_row" as const,
          table: { const: "contacts" },
          identityEq: [{ column: { pointer: "/missing" }, value: { const: "1" } }],
          requiredFields: { pointer: "/fields" },
        },
      } as ToolRegistryEntry,
      {},
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("STRING_SPEC_POINTER_MISSING");
      expect(r.message).toBe("identityEq[0].column: missing at /missing");
    }
  });

  it("STRING_SPEC_TYPE", () => {
    const r = resolveVerificationRequest(
      {
        ...baseEntry,
        verification: {
          kind: "sql_row" as const,
          table: { const: "contacts" },
          identityEq: [{ column: { pointer: "/n" }, value: { const: "1" } }],
          requiredFields: { pointer: "/fields" },
        },
      } as ToolRegistryEntry,
      { n: 3 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("STRING_SPEC_TYPE");
      expect(r.message).toBe("identityEq[0].column: expected string at /n");
    }
  });

  it("STRING_SPEC_EMPTY", () => {
    const r = resolveVerificationRequest(
      {
        ...baseEntry,
        verification: {
          kind: "sql_row" as const,
          table: { const: "contacts" },
          identityEq: [{ column: { pointer: "/s" }, value: { const: "1" } }],
          requiredFields: { pointer: "/fields" },
        },
      } as ToolRegistryEntry,
      { s: "" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("STRING_SPEC_EMPTY");
      expect(r.message).toBe("identityEq[0].column: empty string at /s");
    }
  });

  it("KEY_VALUE_POINTER_MISSING", () => {
    const r = resolveVerificationRequest(
      {
        ...baseEntry,
        verification: {
          kind: "sql_row" as const,
          table: { const: "contacts" },
          identityEq: [{ column: { const: "id" }, value: { pointer: "/kv" } }],
          requiredFields: { pointer: "/fields" },
        },
      } as ToolRegistryEntry,
      { fields: {} },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("KEY_VALUE_POINTER_MISSING");
      expect(r.message).toBe("identityEq[0]. key.value missing at /kv");
    }
  });

  it("KEY_VALUE_NOT_SCALAR", () => {
    const r = resolveVerificationRequest(
      {
        ...baseEntry,
        verification: {
          kind: "sql_row" as const,
          table: { const: "contacts" },
          identityEq: [{ column: { const: "id" }, value: { pointer: "/kv" } }],
          requiredFields: { pointer: "/fields" },
        },
      } as ToolRegistryEntry,
      { fields: {}, kv: { a: 1 } },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("KEY_VALUE_NOT_SCALAR");
      expect(r.message).toBe("identityEq[0]. key.value must be scalar at /kv");
    }
  });

  it("KEY_VALUE_SPEC_INVALID", () => {
    const entry = {
      ...baseEntry,
      verification: {
        kind: "sql_row" as const,
        table: { const: "contacts" },
        identityEq: [{ column: { const: "id" }, value: {} as never }],
        requiredFields: { pointer: "/fields" },
      },
    } as ToolRegistryEntry;
    const r = resolveVerificationRequest(entry, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("KEY_VALUE_SPEC_INVALID");
      expect(r.message).toBe("identityEq[0]. value: invalid spec");
    }
  });

  it("UNSUPPORTED_VERIFICATION_KIND", () => {
    const entry = {
      ...baseEntry,
      verification: { ...baseEntry.verification, kind: "other" },
    } as unknown as ToolRegistryEntry;
    const r = resolveVerificationRequest(entry, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("UNSUPPORTED_VERIFICATION_KIND");
      expect(r.message).toBe("unsupported verification kind");
    }
  });

  it("TABLE_SPEC_INVALID", () => {
    const entry = {
      ...baseEntry,
      verification: {
        kind: "sql_row" as const,
        table: {} as never,
        identityEq: [{ column: { const: "id" }, value: { const: "1" } }],
        requiredFields: { pointer: "/fields" },
      },
    } as ToolRegistryEntry;
    const r = resolveVerificationRequest(entry, { fields: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("TABLE_SPEC_INVALID");
      expect(r.message).toBe("table: invalid spec");
    }
  });

  it("TABLE_POINTER_INVALID", () => {
    const r = resolveVerificationRequest(
      {
        ...baseEntry,
        verification: {
          kind: "sql_row" as const,
          table: { pointer: "/tbl" },
          identityEq: [{ column: { const: "id" }, value: { const: "1" } }],
          requiredFields: { pointer: "/fields" },
        },
      } as ToolRegistryEntry,
      { tbl: "", fields: {} },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("TABLE_POINTER_INVALID");
      expect(r.message).toBe("table: expected non-empty string at /tbl");
    }
  });

  it("REQUIRED_FIELDS_POINTER_MISSING", () => {
    const r = resolveVerificationRequest(baseEntry, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("REQUIRED_FIELDS_POINTER_MISSING");
      expect(r.message).toBe("requiredFields missing at /fields");
    }
  });

  it("REQUIRED_FIELDS_NOT_OBJECT", () => {
    const r = resolveVerificationRequest(baseEntry, { fields: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("REQUIRED_FIELDS_NOT_OBJECT");
      expect(r.message).toBe("requiredFields must be object at /fields");
    }
  });

  it("REQUIRED_FIELDS_VALUE_NOT_SCALAR bigint", () => {
    const fields: Record<string, unknown> = { x: BigInt(7) };
    const r = resolveVerificationRequest(baseEntry, { fields });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("REQUIRED_FIELDS_VALUE_NOT_SCALAR");
    }
  });
});

describe("sql_effects", () => {
  const multiEntry: ToolRegistryEntry = {
    toolId: "multi",
    effectDescriptionTemplate: "m",
    verification: {
      kind: "sql_effects",
      effects: [
        {
          id: "z_last",
          table: { const: "contacts" },
          identityEq: [{ column: { const: "id" }, value: { const: "z" } }],
          requiredFields: { pointer: "/fieldsZ" },
        },
        {
          id: "a_first",
          table: { const: "contacts" },
          identityEq: [{ column: { const: "id" }, value: { const: "a" } }],
          requiredFields: { pointer: "/fieldsA" },
        },
      ],
    },
  };

  it("resolves and sorts effects by id (UTF-16)", () => {
    const r = resolveVerificationRequest(multiEntry, {
      fieldsZ: { n: 1 },
      fieldsA: { n: 2 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.verificationKind !== "sql_effects") return;
    expect(r.effects.map((e) => e.id)).toEqual(["a_first", "z_last"]);
    expect(r.effects[0]!.request.identityEq).toEqual([{ column: "id", value: "a" }]);
    expect(r.effects[1]!.request.identityEq).toEqual([{ column: "id", value: "z" }]);
  });

  it("rejects DUPLICATE_EFFECT_ID", () => {
    const bad: ToolRegistryEntry = {
      ...multiEntry,
      verification: {
        kind: "sql_effects",
        effects: [
          {
            id: "dup",
            table: { const: "contacts" },
            identityEq: [{ column: { const: "id" }, value: { const: "1" } }],
            requiredFields: { pointer: "/f" },
          },
          {
            id: "dup",
            table: { const: "contacts" },
            identityEq: [{ column: { const: "id" }, value: { const: "2" } }],
            requiredFields: { pointer: "/f" },
          },
        ],
      },
    };
    const r = resolveVerificationRequest(bad, { f: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("DUPLICATE_EFFECT_ID");
    }
  });

  it("prefixes effect field errors with effects[id].", () => {
    const r = resolveVerificationRequest(multiEntry, { fieldsZ: [], fieldsA: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("effects[z_last].");
      expect(r.code).toBe("REQUIRED_FIELDS_NOT_OBJECT");
    }
  });
});

describe("sql_relational", () => {
  it("rejects DUPLICATE_EFFECT_ID on duplicate checks[].id", () => {
    const entry: ToolRegistryEntry = {
      toolId: "rel",
      effectDescriptionTemplate: "x",
      verification: {
        kind: "sql_relational",
        checks: [
          {
            checkKind: "related_exists",
            id: "dup",
            childTable: { const: "c" },
            matchEq: [{ column: { const: "k" }, value: { const: "1" } }],
          },
          {
            checkKind: "aggregate",
            id: "dup",
            table: { const: "t" },
            fn: "COUNT_STAR",
            expect: { op: "eq", value: { const: 0 } },
          },
        ],
      },
    };
    const r = resolveVerificationRequest(entry, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("DUPLICATE_EFFECT_ID");
    }
  });

  it("related_exists resolves matchEq and sorts checks by id", () => {
    const entry: ToolRegistryEntry = {
      toolId: "rel",
      effectDescriptionTemplate: "x",
      verification: {
        kind: "sql_relational",
        checks: [
          {
            checkKind: "related_exists",
            id: "z",
            childTable: { const: "c" },
            matchEq: [
              { column: { const: "k" }, value: { pointer: "/a" } },
              { column: { const: "s" }, value: { pointer: "/b" } },
              { column: { const: "t" }, value: { const: "2" } },
            ],
          },
        ],
      },
    };
    const r = resolveVerificationRequest(entry, { a: "1", b: "x" });
    expect(r.ok).toBe(true);
    if (r.ok && r.verificationKind === "sql_relational") {
      expect(r.checks).toHaveLength(1);
      const c = r.checks[0]!;
      expect(c.checkKind).toBe("related_exists");
      if (c.checkKind === "related_exists") {
        expect(c.matchEq).toEqual([
          { column: "k", value: "1" },
          { column: "s", value: "x" },
          { column: "t", value: "2" },
        ]);
      }
    }
  });

  it("related_exists matchEq bad column identifier fails", () => {
    const entry: ToolRegistryEntry = {
      toolId: "rel",
      effectDescriptionTemplate: "x",
      verification: {
        kind: "sql_relational",
        checks: [
          {
            checkKind: "related_exists",
            id: "x",
            childTable: { const: "c" },
            matchEq: [{ column: { const: "bad-col" }, value: { const: "v" } }],
          },
        ],
      },
    };
    const r = resolveVerificationRequest(entry, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("INVALID_IDENTIFIER");
      expect(r.message).toContain("checks[x].identityEq[0].column");
    }
  });

  it("related_exists matchEq missing pointer fails", () => {
    const entry: ToolRegistryEntry = {
      toolId: "rel",
      effectDescriptionTemplate: "x",
      verification: {
        kind: "sql_relational",
        checks: [
          {
            checkKind: "related_exists",
            id: "x",
            childTable: { const: "c" },
            matchEq: [{ column: { const: "s" }, value: { pointer: "/missing" } }],
          },
        ],
      },
    };
    const r = resolveVerificationRequest(entry, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("checks[x].identityEq[0]");
    }
  });
});

describe("buildRegistryMap", () => {
  it("throws TruthLayerError REGISTRY_DUPLICATE_TOOL_ID", () => {
    const entries = [baseEntry, { ...baseEntry, toolId: "t" }];
    expect(() => buildRegistryMap(entries)).toThrow(TruthLayerError);
    try {
      buildRegistryMap(entries);
    } catch (e) {
      expect(e).toBeInstanceOf(TruthLayerError);
      expect((e as TruthLayerError).code).toBe(CLI_OPERATIONAL_CODES.REGISTRY_DUPLICATE_TOOL_ID);
    }
  });
});
