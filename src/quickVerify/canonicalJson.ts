import { compareUtf16Id } from "../resolveExpectation.js";

/** UTF-16 key sort for stable JSON objects (same as canonical params). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((x) => stableStringify(x)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort(compareUtf16Id);
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Canonical UTF-8 string for export file === canonicalToolsArrayUtf8(tools). */
export function canonicalToolsArrayUtf8(tools: object[]): string {
  const sorted = [...tools].sort((a, b) => {
    const ta = (a as { toolId: string }).toolId;
    const tb = (b as { toolId: string }).toolId;
    return compareUtf16Id(ta, tb);
  });
  return stableStringify(sorted);
}
