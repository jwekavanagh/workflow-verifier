import { compareUtf16Id } from "../resolveExpectation.js";
import type { FlatScalar } from "./ingest.js";
import { argmaxTableAction, argmaxTableSegment, T_TABLE } from "./tableScoring.js";

export type ActionBucket = {
  bucketKey: string;
  tableName: string;
  toolName: string;
  flat: Record<string, FlatScalar>;
  /** Original flat paths grouped into this bucket */
  paths: string[];
};

/**
 * Group flat paths into buckets per quick-verify-normative A.9.
 */
export function bucketsForAction(
  toolName: string,
  flat: Record<string, FlatScalar>,
  tables: string[],
): ActionBucket[] {
  if (tables.length === 0) return [];
  const paths = Object.keys(flat).sort(compareUtf16Id);
  const groupPaths = new Map<string, string[]>();
  for (const p of paths) {
    const seg0 = p.includes(".") ? p.slice(0, p.indexOf(".")) : p;
    const { table: W, score } = argmaxTableSegment(seg0, tables);
    const bucketKey = score >= T_TABLE ? W : "__global__";
    const arr = groupPaths.get(bucketKey) ?? [];
    arr.push(p);
    groupPaths.set(bucketKey, arr);
  }
  const out: ActionBucket[] = [];
  for (const [bucketKey, pathList] of [...groupPaths.entries()].sort((a, b) =>
    compareUtf16Id(a[0], b[0]),
  )) {
    if (pathList.length === 0) continue;
    let tableName: string;
    if (bucketKey === "__global__") {
      const { table, score } = argmaxTableAction(toolName, tables);
      tableName = table;
      if (score < T_TABLE) {
        /* still use best-effort table for unit; mapping may yield LOW_CONFIDENCE */
      }
    } else {
      tableName = bucketKey;
    }
    out.push({
      bucketKey,
      tableName,
      toolName,
      flat,
      paths: pathList.sort(compareUtf16Id),
    });
  }
  return out;
}

export function mappingKeyForPath(path: string, bucketKey: string): string {
  if (bucketKey !== "__global__" && path.includes(".")) {
    return path.slice(path.indexOf(".") + 1);
  }
  return path;
}
