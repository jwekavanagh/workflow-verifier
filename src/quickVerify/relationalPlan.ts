import type { FlatScalar } from "./ingest.js";
import type { FkEdge } from "./schemaCatalogTypes.js";
import type { ResolvedRelationalCheck } from "../types.js";
import { T_COL, columnScore } from "./tableScoring.js";

/**
 * Emit related_exists checks for FK edges when flat keys map to child column with sufficient score.
 */
export function planRelationalFromFlat(
  flat: Record<string, FlatScalar>,
  edges: FkEdge[],
): Array<ResolvedRelationalCheck & { checkKind: "related_exists" }> {
  const keys = Object.keys(flat);
  const out: Array<ResolvedRelationalCheck & { checkKind: "related_exists" }> = [];
  const seen = new Set<string>();
  for (const e of edges) {
    const key = `${e.childTable}.${e.childColumn}`;
    if (seen.has(key)) continue;
    let bestK = "";
    let bestS = -1;
    for (const k of keys) {
      const s = columnScore(k, e.childColumn);
      if (s > bestS) {
        bestS = s;
        bestK = k;
      }
    }
    if (bestS < T_COL) continue;
    const v = flat[bestK];
    if (v === null || v === undefined) continue;
    seen.add(key);
    out.push({
      checkKind: "related_exists",
      id: `fk:${e.childTable}.${e.childColumn}`,
      childTable: e.childTable,
      matchEq: [{ column: e.childColumn, value: String(v) }],
    });
  }
  return out;
}
