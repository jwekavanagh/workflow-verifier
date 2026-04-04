import type { RunListItem } from "./debugRunIndex.js";
import { UNSPECIFIED_CUSTOMER } from "./debugRunIndex.js";

export type RunListQuery = {
  loadStatus?: "ok" | "error";
  workflowId?: string;
  status?: "complete" | "incomplete" | "inconsistent";
  failureCategory?: string;
  reasonCode?: string;
  toolId?: string;
  customerId?: string;
  timeFrom?: number;
  timeTo?: number;
  /** When true, only runs with non-empty `pathFindingCodes`. */
  hasPathFindings?: boolean;
  includeLoadErrors: boolean;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function parseRunListQuery(searchParams: URLSearchParams): RunListQuery {
  const loadStatusRaw = searchParams.get("loadStatus");
  const loadStatus =
    loadStatusRaw === "ok" || loadStatusRaw === "error" ? loadStatusRaw : undefined;
  const includeLoadErrors = searchParams.get("includeLoadErrors") !== "false";
  const workflowId = searchParams.get("workflowId") ?? undefined;
  const statusRaw = searchParams.get("status");
  const status =
    statusRaw === "complete" || statusRaw === "incomplete" || statusRaw === "inconsistent"
      ? statusRaw
      : undefined;
  const failureCategory = searchParams.get("failureCategory") ?? undefined;
  const reasonCode = searchParams.get("reasonCode") ?? undefined;
  const toolId = searchParams.get("toolId") ?? undefined;
  const customerId = searchParams.get("customerId") ?? undefined;
  const timeFrom = parseOptionalInt(searchParams.get("timeFrom"));
  const timeTo = parseOptionalInt(searchParams.get("timeTo"));
  const hasPathFindingsRaw = searchParams.get("hasPathFindings");
  const hasPathFindings = hasPathFindingsRaw === "true" ? true : undefined;
  return {
    loadStatus,
    workflowId,
    status,
    failureCategory,
    reasonCode,
    toolId,
    customerId,
    timeFrom,
    timeTo,
    hasPathFindings,
    includeLoadErrors,
  };
}

function parseOptionalInt(s: string | null): number | undefined {
  if (s === null || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function parseLimitCursor(searchParams: URLSearchParams): {
  limit: number;
  offset: number;
} {
  const limitRaw = searchParams.get("limit");
  let limit = limitRaw === null || limitRaw === "" ? DEFAULT_LIMIT : Number(limitRaw);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const cursor = searchParams.get("cursor");
  let offset = 0;
  if (cursor) {
    try {
      const json = Buffer.from(cursor, "base64url").toString("utf8");
      const o = JSON.parse(json) as { offset?: unknown };
      if (typeof o.offset === "number" && Number.isFinite(o.offset) && o.offset >= 0) {
        offset = Math.floor(o.offset);
      }
    } catch {
      offset = 0;
    }
  }
  return { limit, offset };
}

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

export function matchesRunListQuery(row: RunListItem, q: RunListQuery): boolean {
  if (row.loadStatus === "error") {
    if (!q.includeLoadErrors) return false;
    if (q.loadStatus === "ok") return false;
  } else if (q.loadStatus === "error") {
    return false;
  }

  if (q.workflowId !== undefined && row.loadStatus === "ok" && row.workflowId !== q.workflowId) {
    return false;
  }

  if (q.status !== undefined && (row.loadStatus !== "ok" || row.status !== q.status)) {
    return false;
  }

  if (
    q.failureCategory !== undefined &&
    (row.loadStatus !== "ok" || row.actionableCategory !== q.failureCategory)
  ) {
    return false;
  }

  if (q.reasonCode !== undefined && !row.primaryReasonCodes.includes(q.reasonCode)) {
    return false;
  }

  if (
    q.toolId !== undefined &&
    (row.loadStatus !== "ok" || !row.toolIds.includes(q.toolId))
  ) {
    return false;
  }

  if (q.customerId !== undefined) {
    const want = q.customerId === UNSPECIFIED_CUSTOMER ? UNSPECIFIED_CUSTOMER : q.customerId;
    if (row.customerId !== want) return false;
  }

  if (q.timeFrom !== undefined && row.capturedAtEffectiveMs < q.timeFrom) return false;
  if (q.timeTo !== undefined && row.capturedAtEffectiveMs > q.timeTo) return false;

  if (
    q.hasPathFindings === true &&
    (row.loadStatus !== "ok" || row.pathFindingCodes.length === 0)
  ) {
    return false;
  }

  return true;
}

export function filterAndPaginate(
  rows: RunListItem[],
  q: RunListQuery,
  limit: number,
  offset: number,
): { items: RunListItem[]; totalMatched: number; nextCursor: string | null } {
  const matched = rows.filter((r) => matchesRunListQuery(r, q));
  const totalMatched = matched.length;
  const slice = matched.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  const nextCursor = nextOffset < totalMatched ? encodeCursor(nextOffset) : null;
  return { items: slice, totalMatched, nextCursor };
}

export { DEFAULT_LIMIT, MAX_LIMIT };
