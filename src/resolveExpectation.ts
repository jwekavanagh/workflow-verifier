import { getPointer } from "./jsonPointer.js";
import type {
  RelationalExpectSpec,
  ResolvedEffect,
  ResolvedRelationalCheck,
  SqlRelationalCheckSpec,
  SqlRowVerificationSpec,
  ToolRegistryEntry,
  VerificationRequest,
  VerificationScalar,
} from "./types.js";
import { CLI_OPERATIONAL_CODES } from "./failureCatalog.js";
import { TruthLayerError } from "./truthLayerError.js";
import { REGISTRY_RESOLVER_CODE } from "./wireReasonCodes.js";

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** UTF-16 code unit lexicographic order (same as `canonicalJsonForParams` object key sort). */
export function compareUtf16Id(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export type ResolveResult =
  | { ok: true; verificationKind: "sql_row"; request: VerificationRequest }
  | { ok: true; verificationKind: "sql_effects"; effects: ResolvedEffect[] }
  | { ok: true; verificationKind: "sql_relational"; checks: ResolvedRelationalCheck[] }
  | { ok: false; code: string; message: string };

function resolveStringSpec(
  spec: { const: string } | { pointer: string },
  params: Record<string, unknown>,
  label: string,
): { ok: true; value: string } | { ok: false; code: string; message: string } {
  if ("const" in spec) {
    const v = spec.const;
    if (typeof v !== "string" || v.length === 0) {
      return {
        ok: false,
        code: REGISTRY_RESOLVER_CODE.CONST_STRING_EMPTY,
        message: `${label}: const must be non-empty string`,
      };
    }
    return { ok: true, value: v };
  }
  const got = getPointer(params, spec.pointer);
  if (got === undefined || got === null) {
    return {
      ok: false,
      code: REGISTRY_RESOLVER_CODE.STRING_SPEC_POINTER_MISSING,
      message: `${label}: missing at ${spec.pointer}`,
    };
  }
  if (typeof got !== "string") {
    return {
      ok: false,
      code: REGISTRY_RESOLVER_CODE.STRING_SPEC_TYPE,
      message: `${label}: expected string at ${spec.pointer}`,
    };
  }
  if (got.length === 0) {
    return {
      ok: false,
      code: REGISTRY_RESOLVER_CODE.STRING_SPEC_EMPTY,
      message: `${label}: empty string at ${spec.pointer}`,
    };
  }
  return { ok: true, value: got };
}

function resolveKeyValue(
  spec: { const: string | number | boolean | null } | { pointer: string },
  params: Record<string, unknown>,
): { ok: true; value: string } | { ok: false; code: string; message: string } {
  if ("const" in spec && !("pointer" in spec)) {
    return { ok: true, value: String(spec.const) };
  }
  if ("pointer" in spec) {
    const ptr = (spec as { pointer: string }).pointer;
    const got = getPointer(params, ptr);
    if (got === undefined || got === null) {
      return {
        ok: false,
        code: REGISTRY_RESOLVER_CODE.KEY_VALUE_POINTER_MISSING,
        message: `key.value missing at ${ptr}`,
      };
    }
    if (typeof got === "object") {
      return {
        ok: false,
        code: REGISTRY_RESOLVER_CODE.KEY_VALUE_NOT_SCALAR,
        message: `key.value must be scalar at ${ptr}`,
      };
    }
    return { ok: true, value: String(got) };
  }
  return { ok: false, code: REGISTRY_RESOLVER_CODE.KEY_VALUE_SPEC_INVALID, message: "key.value: invalid spec" };
}

function resolveSqlRowSpec(
  params: Record<string, unknown>,
  spec: SqlRowVerificationSpec,
  labelPrefix: string,
): { ok: true; request: VerificationRequest } | { ok: false; code: string; message: string } {
  const tableRes =
    "const" in spec.table && !("pointer" in spec.table)
      ? { ok: true as const, value: spec.table.const }
      : "pointer" in spec.table
        ? (() => {
            const tptr = (spec.table as { pointer: string }).pointer;
            const got = getPointer(params, tptr);
            if (got === undefined || got === null || typeof got !== "string" || got.length === 0) {
              return {
                ok: false as const,
                code: REGISTRY_RESOLVER_CODE.TABLE_POINTER_INVALID,
                message: `${labelPrefix}table: expected non-empty string at ${tptr}`,
              };
            }
            return { ok: true as const, value: got };
          })()
        : {
            ok: false as const,
            code: REGISTRY_RESOLVER_CODE.TABLE_SPEC_INVALID,
            message: `${labelPrefix}table: invalid spec`,
          };

  if (!tableRes.ok) return tableRes;

  const colRes = resolveStringSpec(spec.key.column, params, `${labelPrefix}key.column`);
  if (!colRes.ok) return colRes;
  const valRes = resolveKeyValue(spec.key.value, params);
  if (!valRes.ok) {
    return { ok: false, code: valRes.code, message: `${labelPrefix}${valRes.message}` };
  }

  if (!IDENT.test(tableRes.value)) {
    return {
      ok: false,
      code: REGISTRY_RESOLVER_CODE.INVALID_IDENTIFIER,
      message: `${labelPrefix}table: ${tableRes.value}`,
    };
  }
  if (!IDENT.test(colRes.value)) {
    return {
      ok: false,
      code: REGISTRY_RESOLVER_CODE.INVALID_IDENTIFIER,
      message: `${labelPrefix}key.column: ${colRes.value}`,
    };
  }

  const fieldsRaw = getPointer(params, spec.requiredFields.pointer);
  if (fieldsRaw === undefined || fieldsRaw === null) {
    return {
      ok: false,
      code: REGISTRY_RESOLVER_CODE.REQUIRED_FIELDS_POINTER_MISSING,
      message: `${labelPrefix}requiredFields missing at ${spec.requiredFields.pointer}`,
    };
  }
  if (typeof fieldsRaw !== "object" || Array.isArray(fieldsRaw)) {
    return {
      ok: false,
      code: REGISTRY_RESOLVER_CODE.REQUIRED_FIELDS_NOT_OBJECT,
      message: `${labelPrefix}requiredFields must be object at ${spec.requiredFields.pointer}`,
    };
  }

  const requiredFields: Record<string, VerificationScalar> = {};
  for (const k of Object.keys(fieldsRaw as Record<string, unknown>)) {
    if (!IDENT.test(k)) {
      return {
        ok: false,
        code: REGISTRY_RESOLVER_CODE.INVALID_IDENTIFIER,
        message: `${labelPrefix}requiredFields key: ${k}`,
      };
    }
    const val = (fieldsRaw as Record<string, unknown>)[k];
    if (val === undefined) {
      return {
        ok: false,
        code: REGISTRY_RESOLVER_CODE.REQUIRED_FIELDS_VALUE_UNDEFINED,
        message: `${labelPrefix}requiredFields.${k} must not be undefined`,
      };
    }
    if (typeof val === "object" && val !== null) {
      return {
        ok: false,
        code: REGISTRY_RESOLVER_CODE.REQUIRED_FIELDS_VALUE_NOT_SCALAR,
        message: `${labelPrefix}requiredFields.${k} must be string, number, boolean, or null`,
      };
    }
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean" || val === null) {
      requiredFields[k] = val;
    } else {
      return {
        ok: false,
        code: REGISTRY_RESOLVER_CODE.REQUIRED_FIELDS_VALUE_NOT_SCALAR,
        message: `${labelPrefix}requiredFields.${k} must be string, number, boolean, or null`,
      };
    }
  }

  return {
    ok: true,
    request: {
      kind: "sql_row",
      table: tableRes.value,
      keyColumn: colRes.value,
      keyValue: valRes.value,
      requiredFields,
    },
  };
}

function resolveTableIdent(
  spec: { const: string } | { pointer: string },
  params: Record<string, unknown>,
  label: string,
): { ok: true; value: string } | { ok: false; code: string; message: string } {
  const tableRes =
    "const" in spec && !("pointer" in spec)
      ? { ok: true as const, value: spec.const }
      : "pointer" in spec
        ? (() => {
            const tptr = (spec as { pointer: string }).pointer;
            const got = getPointer(params, tptr);
            if (got === undefined || got === null || typeof got !== "string" || got.length === 0) {
              return {
                ok: false as const,
                code: REGISTRY_RESOLVER_CODE.TABLE_POINTER_INVALID,
                message: `${label}: expected non-empty string at ${tptr}`,
              };
            }
            return { ok: true as const, value: got };
          })()
        : {
            ok: false as const,
            code: REGISTRY_RESOLVER_CODE.TABLE_SPEC_INVALID,
            message: `${label}: invalid spec`,
          };
  if (!tableRes.ok) return tableRes;
  if (!IDENT.test(tableRes.value)) {
    return {
      ok: false,
      code: REGISTRY_RESOLVER_CODE.INVALID_IDENTIFIER,
      message: `${label}: ${tableRes.value}`,
    };
  }
  return { ok: true, value: tableRes.value };
}

function resolveExpectNumber(
  spec: RelationalExpectSpec["value"],
  params: Record<string, unknown>,
  label: string,
): { ok: true; value: number } | { ok: false; code: string; message: string } {
  if ("const" in spec && !("pointer" in spec)) {
    const n = spec.const;
    if (typeof n !== "number" || !Number.isFinite(n)) {
      return {
        ok: false,
        code: REGISTRY_RESOLVER_CODE.RELATIONAL_EXPECT_VALUE_INVALID,
        message: `${label}: const must be a finite number`,
      };
    }
    return { ok: true, value: n };
  }
  const ptr = (spec as { pointer: string }).pointer;
  const got = getPointer(params, ptr);
  if (got === undefined || got === null) {
    return {
      ok: false,
      code: REGISTRY_RESOLVER_CODE.RELATIONAL_EXPECT_VALUE_INVALID,
      message: `${label}: missing number at ${ptr}`,
    };
  }
  if (typeof got !== "number" || !Number.isFinite(got)) {
    return {
      ok: false,
      code: REGISTRY_RESOLVER_CODE.RELATIONAL_EXPECT_VALUE_INVALID,
      message: `${label}: expected finite number at ${ptr}`,
    };
  }
  return { ok: true, value: got };
}

function resolveSqlRelationalCheck(
  params: Record<string, unknown>,
  spec: SqlRelationalCheckSpec,
  labelPrefix: string,
): { ok: true; check: ResolvedRelationalCheck } | { ok: false; code: string; message: string } {
  if (spec.checkKind === "related_exists") {
    const child = resolveTableIdent(spec.childTable, params, `${labelPrefix}childTable`);
    if (!child.ok) return child;
    const fkCol = resolveStringSpec(spec.fkColumn, params, `${labelPrefix}fkColumn`);
    if (!fkCol.ok) return fkCol;
    if (!IDENT.test(fkCol.value)) {
      return {
        ok: false,
        code: REGISTRY_RESOLVER_CODE.INVALID_IDENTIFIER,
        message: `${labelPrefix}fkColumn: ${fkCol.value}`,
      };
    }
    const fkVal = resolveKeyValue(spec.fkValue, params);
    if (!fkVal.ok) {
      return { ok: false, code: fkVal.code, message: `${labelPrefix}${fkVal.message}` };
    }
    const whereEq: Array<{ column: string; value: string }> = [];
    for (let i = 0; i < (spec.whereEq?.length ?? 0); i++) {
      const w = spec.whereEq![i]!;
      const col = resolveStringSpec(w.column, params, `${labelPrefix}whereEq[${i}].column`);
      if (!col.ok) return col;
      if (!IDENT.test(col.value)) {
        return {
          ok: false,
          code: REGISTRY_RESOLVER_CODE.INVALID_IDENTIFIER,
          message: `${labelPrefix}whereEq[${i}].column: ${col.value}`,
        };
      }
      const val = resolveKeyValue(w.value, params);
      if (!val.ok) {
        return { ok: false, code: val.code, message: `${labelPrefix}whereEq[${i}]. ${val.message}` };
      }
      whereEq.push({ column: col.value, value: val.value });
    }
    return {
      ok: true,
      check: {
        checkKind: "related_exists",
        id: spec.id,
        childTable: child.value,
        fkColumn: fkCol.value,
        fkValue: fkVal.value,
        whereEq,
      },
    };
  }

  if (spec.checkKind === "aggregate") {
    const tbl = resolveTableIdent(spec.table, params, `${labelPrefix}table`);
    if (!tbl.ok) return tbl;
    let sumColumn: string | undefined;
    if (spec.fn === "SUM") {
      if (!spec.sumColumn) {
        return {
          ok: false,
          code: REGISTRY_RESOLVER_CODE.RELATIONAL_SUM_COLUMN_REQUIRED,
          message: `${labelPrefix}sumColumn required when fn is SUM`,
        };
      }
      const sc = resolveStringSpec(spec.sumColumn, params, `${labelPrefix}sumColumn`);
      if (!sc.ok) return sc;
      if (!IDENT.test(sc.value)) {
        return {
          ok: false,
          code: REGISTRY_RESOLVER_CODE.INVALID_IDENTIFIER,
          message: `${labelPrefix}sumColumn: ${sc.value}`,
        };
      }
      sumColumn = sc.value;
    }
    const whereEq: Array<{ column: string; value: string }> = [];
    for (let i = 0; i < (spec.whereEq?.length ?? 0); i++) {
      const w = spec.whereEq![i]!;
      const col = resolveStringSpec(w.column, params, `${labelPrefix}whereEq[${i}].column`);
      if (!col.ok) return col;
      if (!IDENT.test(col.value)) {
        return {
          ok: false,
          code: REGISTRY_RESOLVER_CODE.INVALID_IDENTIFIER,
          message: `${labelPrefix}whereEq[${i}].column: ${col.value}`,
        };
      }
      const val = resolveKeyValue(w.value, params);
      if (!val.ok) {
        return { ok: false, code: val.code, message: `${labelPrefix}whereEq[${i}]. ${val.message}` };
      }
      whereEq.push({ column: col.value, value: val.value });
    }
    const exp = resolveExpectNumber(spec.expect.value, params, `${labelPrefix}expect.value`);
    if (!exp.ok) return exp;
    return {
      ok: true,
      check: {
        checkKind: "aggregate",
        id: spec.id,
        table: tbl.value,
        fn: spec.fn,
        sumColumn,
        whereEq,
        expectOp: spec.expect.op,
        expectValue: exp.value,
      },
    };
  }

  const left = resolveTableIdent(spec.leftTable, params, `${labelPrefix}leftTable`);
  if (!left.ok) return left;
  const right = resolveTableIdent(spec.rightTable, params, `${labelPrefix}rightTable`);
  if (!right.ok) return right;
  const lj = resolveStringSpec(spec.join.leftColumn, params, `${labelPrefix}join.leftColumn`);
  if (!lj.ok) return lj;
  if (!IDENT.test(lj.value)) {
    return {
      ok: false,
      code: REGISTRY_RESOLVER_CODE.INVALID_IDENTIFIER,
      message: `${labelPrefix}join.leftColumn: ${lj.value}`,
    };
  }
  const rj = resolveStringSpec(spec.join.rightColumn, params, `${labelPrefix}join.rightColumn`);
  if (!rj.ok) return rj;
  if (!IDENT.test(rj.value)) {
    return {
      ok: false,
      code: REGISTRY_RESOLVER_CODE.INVALID_IDENTIFIER,
      message: `${labelPrefix}join.rightColumn: ${rj.value}`,
    };
  }
  const whereEq: Array<{ side: "left" | "right"; column: string; value: string }> = [];
  for (let i = 0; i < (spec.whereEq?.length ?? 0); i++) {
    const w = spec.whereEq![i]!;
    const col = resolveStringSpec(w.column, params, `${labelPrefix}whereEq[${i}].column`);
    if (!col.ok) return col;
    if (!IDENT.test(col.value)) {
      return {
        ok: false,
        code: REGISTRY_RESOLVER_CODE.INVALID_IDENTIFIER,
        message: `${labelPrefix}whereEq[${i}].column: ${col.value}`,
      };
    }
    const val = resolveKeyValue(w.value, params);
    if (!val.ok) {
      return { ok: false, code: val.code, message: `${labelPrefix}whereEq[${i}]. ${val.message}` };
    }
    whereEq.push({ side: w.tableSide, column: col.value, value: val.value });
  }
  const exp = resolveExpectNumber(spec.expect.value, params, `${labelPrefix}expect.value`);
  if (!exp.ok) return exp;
  return {
    ok: true,
    check: {
      checkKind: "join_count",
      id: spec.id,
      leftTable: left.value,
      rightTable: right.value,
      leftJoinColumn: lj.value,
      rightJoinColumn: rj.value,
      whereEq,
      expectOp: spec.expect.op,
      expectValue: exp.value,
    },
  };
}

export function renderIntendedEffect(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\/[^{}]+)\}/g, (_, ptr: string) => {
    const v = getPointer(params, ptr);
    if (v === undefined) return "MISSING";
    return JSON.stringify(v);
  });
}

export function resolveVerificationRequest(entry: ToolRegistryEntry, params: Record<string, unknown>): ResolveResult {
  const v = entry.verification;
  if (v.kind === "sql_row") {
    const row = resolveSqlRowSpec(params, v, "");
    if (!row.ok) return row;
    return { ok: true, verificationKind: "sql_row", request: row.request };
  }
  if (v.kind === "sql_relational") {
    const seen = new Set<string>();
    const checks: ResolvedRelationalCheck[] = [];
    for (const item of v.checks) {
      if (seen.has(item.id)) {
        return {
          ok: false,
          code: REGISTRY_RESOLVER_CODE.DUPLICATE_EFFECT_ID,
          message: `Duplicate effect id in registry: ${item.id}`,
        };
      }
      seen.add(item.id);
      const r = resolveSqlRelationalCheck(params, item, `checks[${item.id}].`);
      if (!r.ok) return r;
      checks.push(r.check);
    }
    checks.sort((a, b) => compareUtf16Id(a.id, b.id));
    return { ok: true, verificationKind: "sql_relational", checks };
  }
  if (v.kind !== "sql_effects") {
    return {
      ok: false,
      code: REGISTRY_RESOLVER_CODE.UNSUPPORTED_VERIFICATION_KIND,
      message: "unsupported verification kind",
    };
  }

  const seen = new Set<string>();
  const effects: ResolvedEffect[] = [];
  for (const item of v.effects) {
    if (seen.has(item.id)) {
      return {
        ok: false,
        code: REGISTRY_RESOLVER_CODE.DUPLICATE_EFFECT_ID,
        message: `Duplicate effect id in registry: ${item.id}`,
      };
    }
    seen.add(item.id);
    const { id, ...spec } = item;
    const row = resolveSqlRowSpec(params, spec as SqlRowVerificationSpec, `effects[${id}].`);
    if (!row.ok) return row;
    effects.push({ id, request: row.request });
  }

  effects.sort((a, b) => compareUtf16Id(a.id, b.id));
  return { ok: true, verificationKind: "sql_effects", effects };
}

export function buildRegistryMap(entries: ToolRegistryEntry[]): Map<string, ToolRegistryEntry> {
  const m = new Map<string, ToolRegistryEntry>();
  for (const e of entries) {
    if (m.has(e.toolId)) {
      throw new TruthLayerError(
        CLI_OPERATIONAL_CODES.REGISTRY_DUPLICATE_TOOL_ID,
        `Duplicate toolId in registry: ${e.toolId}`,
      );
    }
    m.set(e.toolId, e);
  }
  return m;
}
