import { compareUtf16Id } from "../resolveExpectation.js";
import { T_AMBIGUITY_DELTA, T_COL, T_OVERALL, T_TABLE } from "./thresholds.js";

export function englishSingular(v1: string): string {
  if (v1.length >= 4 && v1.endsWith("ies")) return v1.slice(0, -3) + "y";
  if (v1.endsWith("ses") || v1.endsWith("xes") || v1.endsWith("ches") || v1.endsWith("shes")) {
    if (v1.length >= 3) return v1.slice(0, -2);
  }
  if (v1.endsWith("s") && !v1.endsWith("ss") && v1.length > 1) return v1.slice(0, -1);
  return v1;
}

export function englishPlural(v1: string): string {
  const n = v1.length;
  if (n === 0) return v1;
  const prev = v1[n - 2] ?? "";
  const vowel = /[aeiou]/i.test(prev);
  if (v1.endsWith("y") && n >= 2 && !vowel) return v1.slice(0, -1) + "ies";
  if (v1.endsWith("s")) return v1;
  return v1 + "s";
}

export function variants(T: string): string[] {
  const v0 = T;
  const v1 = v0.replace(/A-Z/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
  const v2 = englishSingular(v1);
  const v3 = englishPlural(v1);
  const set = new Set([v0, v1, v2, v3]);
  return [...set].sort(compareUtf16Id);
}

export function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  const dp: number[] = Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  const d = dp[n];
  return 1 - d / Math.max(m, n);
}

export function tokenMatchScore(s: string, v: string): number {
  if (s === v) return 1.0;
  if (s.includes(v) || v.includes(s)) return 0.75;
  const r = levenshteinRatio(s, v);
  return r >= 0.85 ? 0.7 : 0;
}

export function scoreSegmentToTable(seg0: string, tableName: string): number {
  const s = seg0.replace(/A-Z/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
  let best = 0;
  for (const v of variants(tableName)) {
    best = Math.max(best, tokenMatchScore(s, v));
  }
  return best;
}

export function tokens(toolName: string): string[] {
  return toolName
    .split(/[^a-zA-Z0-9]+/)
    .filter((x) => x.length > 0)
    .map((t) => t.replace(/A-Z/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32)));
}

export function tableScoreAction(toolName: string, T: string): number {
  const toks = tokens(toolName);
  let best = 0;
  for (const t of toks) {
    for (const v of variants(T)) {
      best = Math.max(best, tokenMatchScore(t, v));
    }
  }
  return best;
}

export function argmaxTableSegment(seg0: string, tables: string[]): { table: string; score: number } {
  let bestT = tables[0] ?? "";
  let bestS = -1;
  const scored: Array<{ t: string; s: number; vMatched: string }> = [];
  for (const T of tables) {
    const s = scoreSegmentToTable(seg0, T);
    scored.push({ t: T, s, vMatched: "" });
    if (s > bestS || (s === bestS && compareUtf16Id(T, bestT) < 0)) {
      bestS = s;
      bestT = T;
    }
  }
  if (bestS < 0) bestS = 0;
  return { table: bestT, score: bestS };
}

export function argmaxTableAction(toolName: string, tables: string[]): { table: string; score: number } {
  let bestT = tables[0] ?? "";
  let bestS = -1;
  for (const T of tables) {
    const s = tableScoreAction(toolName, T);
    if (s > bestS || (s === bestS && compareUtf16Id(T, bestT) < 0)) {
      bestS = s;
      bestT = T;
    }
  }
  return { table: bestT, score: Math.max(0, bestS) };
}

function normalizeSnakeCamel(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/_/g, "");
  const nb = b.toLowerCase().replace(/_/g, "");
  return na === nb;
}

function stripIdSuffix(k: string, col: string): boolean {
  const kl = k.toLowerCase();
  const cl = col.toLowerCase();
  if (kl.endsWith("id") && kl.slice(0, -2) === cl) return true;
  if (kl.endsWith("_id") && kl.slice(0, -3) === cl) return true;
  return false;
}

export function columnScore(paramKey: string, colName: string): number {
  if (paramKey === colName) return 1.0;
  if (paramKey.toLowerCase() === colName.toLowerCase()) return 0.95;
  if (normalizeSnakeCamel(paramKey, colName)) return 0.9;
  if (stripIdSuffix(paramKey, colName)) return 0.85;
  const r = levenshteinRatio(paramKey.toLowerCase(), colName.toLowerCase());
  return r >= 0.8 ? r : 0;
}

export function bestColumnForParam(paramKey: string, columns: string[]): { col: string; score: number } {
  let best = columns[0] ?? "";
  let bestS = -1;
  for (const c of columns) {
    const s = columnScore(paramKey, c);
    if (s > bestS || (s === bestS && compareUtf16Id(c, best) < 0)) {
      bestS = s;
      best = c;
    }
  }
  return { col: best, score: Math.max(0, bestS) };
}

export { T_TABLE, T_COL, T_OVERALL, T_AMBIGUITY_DELTA };
