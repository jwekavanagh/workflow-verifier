import { getPointer } from "./jsonPointer.js";
import type { ToolRegistryEntry, VerificationRequest } from "./types.js";

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export type ResolveResult =
  | { ok: true; request: VerificationRequest }
  | { ok: false; code: string; message: string };

function resolveStringSpec(
  spec: { const: string } | { pointer: string },
  params: Record<string, unknown>,
  label: string,
): { ok: true; value: string } | { ok: false; code: string; message: string } {
  if ("const" in spec) {
    const v = spec.const;
    if (typeof v !== "string" || v.length === 0) {
      return { ok: false, code: "RESOLVE_POINTER", message: `${label}: const must be non-empty string` };
    }
    return { ok: true, value: v };
  }
  const got = getPointer(params, spec.pointer);
  if (got === undefined || got === null) {
    return { ok: false, code: "RESOLVE_POINTER", message: `${label}: missing at ${spec.pointer}` };
  }
  if (typeof got !== "string" || got.length === 0) {
    return { ok: false, code: "RESOLVE_POINTER", message: `${label}: expected string at ${spec.pointer}` };
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
      return { ok: false, code: "RESOLVE_POINTER", message: `key.value missing at ${ptr}` };
    }
    if (typeof got === "object") {
      return { ok: false, code: "RESOLVE_POINTER", message: `key.value must be scalar at ${ptr}` };
    }
    return { ok: true, value: String(got) };
  }
  return { ok: false, code: "RESOLVE_POINTER", message: "key.value: invalid spec" };
}

export function renderIntendedEffect(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\/[^{}]+)\}/g, (_, ptr: string) => {
    const v = getPointer(params, ptr);
    if (v === undefined) return "MISSING";
    return JSON.stringify(v);
  });
}

export function resolveVerificationRequest(
  entry: ToolRegistryEntry,
  params: Record<string, unknown>,
): ResolveResult {
  const v = entry.verification;
  if (v.kind !== "sql_row") {
    return { ok: false, code: "RESOLVE_POINTER", message: "unsupported verification kind" };
  }

  const tableRes =
    "const" in v.table && !("pointer" in v.table)
      ? { ok: true as const, value: v.table.const }
      : "pointer" in v.table
        ? (() => {
            const tptr = (v.table as { pointer: string }).pointer;
            const got = getPointer(params, tptr);
            if (got === undefined || got === null || typeof got !== "string" || got.length === 0) {
              return {
                ok: false as const,
                code: "RESOLVE_POINTER",
                message: `table: expected non-empty string at ${tptr}`,
              };
            }
            return { ok: true as const, value: got };
          })()
        : { ok: false as const, code: "RESOLVE_POINTER", message: "table: invalid spec" };

  if (!tableRes.ok) return tableRes;

  const colRes = resolveStringSpec(v.key.column, params, "key.column");
  if (!colRes.ok) return colRes;
  const valRes = resolveKeyValue(v.key.value, params);
  if (!valRes.ok) return valRes;

  if (!IDENT.test(tableRes.value)) {
    return { ok: false, code: "INVALID_IDENTIFIER", message: `table: ${tableRes.value}` };
  }
  if (!IDENT.test(colRes.value)) {
    return { ok: false, code: "INVALID_IDENTIFIER", message: `key.column: ${colRes.value}` };
  }

  const fieldsRaw = getPointer(params, v.requiredFields.pointer);
  if (fieldsRaw === undefined || fieldsRaw === null) {
    return {
      ok: false,
      code: "RESOLVE_POINTER",
      message: `requiredFields missing at ${v.requiredFields.pointer}`,
    };
  }
  if (typeof fieldsRaw !== "object" || Array.isArray(fieldsRaw)) {
    return {
      ok: false,
      code: "RESOLVE_POINTER",
      message: `requiredFields must be object at ${v.requiredFields.pointer}`,
    };
  }

  const requiredFields: Record<string, string> = {};
  for (const k of Object.keys(fieldsRaw as Record<string, unknown>)) {
    if (!IDENT.test(k)) {
      return { ok: false, code: "INVALID_IDENTIFIER", message: `requiredFields key: ${k}` };
    }
    const val = (fieldsRaw as Record<string, unknown>)[k];
    if (typeof val !== "string") {
      return {
        ok: false,
        code: "RESOLVE_POINTER",
        message: `requiredFields.${k} must be string`,
      };
    }
    requiredFields[k] = val;
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

export function buildRegistryMap(entries: ToolRegistryEntry[]): Map<string, ToolRegistryEntry> {
  const m = new Map<string, ToolRegistryEntry>();
  for (const e of entries) {
    if (m.has(e.toolId)) {
      throw new Error(`Duplicate toolId in registry: ${e.toolId}`);
    }
    m.set(e.toolId, e);
  }
  return m;
}
