import { compareUtf16Id } from "../resolveExpectation.js";
import type { VerificationRequest, VerificationScalar } from "../types.js";
import type { SchemaCatalog } from "./schemaCatalogTypes.js";
import type { ActionBucket } from "./decomposeUnits.js";
import { mappingKeyForPath } from "./decomposeUnits.js";
import type { FlatScalar } from "./ingest.js";
import { T_AMBIGUITY_DELTA, T_COL, T_OVERALL, columnScore, tableScoreAction } from "./tableScoring.js";

function toScalar(v: FlatScalar): VerificationScalar | undefined {
  if (v === null) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") return v;
  return undefined;
}

function scalarToIdentityString(v: VerificationScalar): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return v;
}

export type RowUnitPlan = {
  request: VerificationRequest | null;
  confidence: number;
  reasonCodes: string[];
  rationale: string[];
  alternates?: Array<{ table: string; score: number }>;
};

export async function planRowUnit(catalog: SchemaCatalog, b: ActionBucket, allTables: string[]): Promise<RowUnitPlan> {
  const rationale: string[] = [];
  const reasonCodes: string[] = [];

  const scores = allTables
    .map((t) => ({ table: t, score: tableScoreAction(b.toolName, t) }))
    .sort((a, b) => b.score - a.score || compareUtf16Id(a.table, b.table));
  const s1 = scores[0]?.score ?? 0;
  const s2 = scores[1]?.score ?? 0;
  const top = scores[0]?.table ?? b.tableName;
  const second = scores[1]?.table;

  if (b.bucketKey === "__global__") {
    if (s1 < T_OVERALL) {
      reasonCodes.push("MAPPING_LOW_CONFIDENCE");
      rationale.push(`Best table score ${s1.toFixed(3)} < T_OVERALL ${T_OVERALL}`);
    }
    if (second !== undefined && s1 - s2 <= T_AMBIGUITY_DELTA && compareUtf16Id(top, second) !== 0) {
      reasonCodes.push("MAPPING_AMBIGUOUS");
      rationale.push(`Top tables within ambiguity delta: ${top} vs ${second}`);
      return {
        request: null,
        confidence: s1,
        reasonCodes,
        rationale,
        alternates: [
          { table: top, score: s1 },
          { table: second, score: s2 },
        ],
      };
    }
  }

  const tableName = b.tableName;
  const cols = await catalog.listColumns(tableName);
  const colNames = cols.map((c) => c.name).sort(compareUtf16Id);
  let pk = await catalog.primaryKeyColumns(tableName);
  if (pk.length === 0) {
    const uniques = await catalog.listUniqueConstraints(tableName);
    const sorted = [...uniques].sort(
      (a, b) => a.columns.length - b.columns.length || compareUtf16Id(a.columns.join(","), b.columns.join(",")),
    );
    pk = sorted[0]?.columns ?? [];
  }
  if (pk.length === 0) {
    reasonCodes.push("MAPPING_NO_UNIQUE_KEY");
    rationale.push(`No primary or unique key on ${tableName}`);
    return { request: null, confidence: 0, reasonCodes, rationale };
  }

  const mkEntries = b.paths.map((path) => ({
    path,
    mk: mappingKeyForPath(path, b.bucketKey),
    value: b.flat[path],
  }));

  const identityEq: VerificationRequest["identityEq"] = [];
  let minIdScore = 1;
  for (const col of [...pk].sort(compareUtf16Id)) {
    let bestMk = "";
    let bestS = -1;
    for (const e of mkEntries) {
      const s = columnScore(e.mk, col);
      if (s > bestS || (s === bestS && compareUtf16Id(e.mk, bestMk) < 0)) {
        bestS = s;
        bestMk = e.mk;
      }
    }
    if (bestS < T_COL) {
      reasonCodes.push("MAPPING_NO_UNIQUE_KEY");
      rationale.push(`PK column ${col} has no param match >= T_COL`);
      return { request: null, confidence: 0, reasonCodes, rationale };
    }
    minIdScore = Math.min(minIdScore, bestS);
    const sc = toScalar(mkEntries.find((x) => x.mk === bestMk)?.value ?? null);
    if (sc === undefined) {
      reasonCodes.push("MAPPING_NO_UNIQUE_KEY");
      rationale.push(`PK ${col} mapped value not a verification scalar`);
      return { request: null, confidence: 0, reasonCodes, rationale };
    }
    identityEq.push({
      column: col,
      value: scalarToIdentityString(sc),
    });
  }

  const pkSet = new Set(pk);
  const rf: Record<string, VerificationScalar> = {};
  for (const col of colNames) {
    if (pkSet.has(col)) continue;
    let picked: { s: number; v: VerificationScalar } | null = null;
    for (const e of mkEntries) {
      const s = columnScore(e.mk, col);
      if (s < T_COL) continue;
      const vs = toScalar(e.value);
      if (vs === undefined) continue;
      if (picked === null || s > picked.s) picked = { s, v: vs };
    }
    if (picked) rf[col] = picked.v;
  }

  const segScore = tableScoreAction(b.toolName, tableName);
  const confidence = Math.min(1, (segScore + minIdScore + s1) / 3);

  const request: VerificationRequest = {
    kind: "sql_row",
    table: tableName,
    identityEq,
    requiredFields: rf,
  };
  rationale.push(`Table ${tableName}, PK [${pk.join(",")}], ${Object.keys(rf).length} field(s) compared`);
  return { request, confidence, reasonCodes, rationale };
}
