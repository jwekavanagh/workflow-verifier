import { describe, expect, it } from "vitest";
import {
  encodeCursor,
  filterAndPaginate,
  matchesRunListQuery,
  parseLimitCursor,
  parseRunListQuery,
} from "./debugRunFilters.js";
import type { RunListItem } from "./debugRunIndex.js";
import { UNSPECIFIED_CUSTOMER } from "./debugRunIndex.js";

const rows: RunListItem[] = [
  {
    runId: "a",
    loadStatus: "ok",
    workflowId: "wf1",
    status: "complete",
    actionableCategory: "complete",
    toolIds: ["t1"],
    customerId: UNSPECIFIED_CUSTOMER,
    primaryReasonCodes: [],
    pathFindingCodes: [],
    capturedAtEffectiveMs: 1000,
  },
  {
    runId: "b",
    loadStatus: "ok",
    workflowId: "wf2",
    status: "inconsistent",
    actionableCategory: "ambiguous",
    toolIds: ["crm.x"],
    customerId: "cust-1",
    primaryReasonCodes: ["VALUE_MISMATCH"],
    pathFindingCodes: ["MISSING_RUN_COMPLETED", "NO_RETRIEVAL_EVENTS"],
    capturedAtEffectiveMs: 2000,
  },
  {
    runId: "c",
    loadStatus: "error",
    toolIds: [],
    customerId: UNSPECIFIED_CUSTOMER,
    primaryReasonCodes: ["MISSING_EVENTS"],
    pathFindingCodes: [],
    capturedAtEffectiveMs: 500,
    error: { code: "MISSING_EVENTS", message: "x" },
  },
];

describe("debugRunFilters", () => {
  it("matchesRunListQuery workflowId keeps error rows when includeLoadErrors true", () => {
    const q = parseRunListQuery(new URLSearchParams("workflowId=wf1"));
    expect(matchesRunListQuery(rows[0]!, q)).toBe(true);
    expect(matchesRunListQuery(rows[1]!, q)).toBe(false);
    expect(matchesRunListQuery(rows[2]!, q)).toBe(true);
  });

  it("includeLoadErrors false drops error rows", () => {
    const q = parseRunListQuery(new URLSearchParams("includeLoadErrors=false"));
    expect(matchesRunListQuery(rows[2]!, q)).toBe(false);
  });

  it("filterAndPaginate totalMatched and cursor", () => {
    const q = parseRunListQuery(new URLSearchParams(""));
    const p1 = filterAndPaginate(rows, q, 2, 0);
    expect(p1.totalMatched).toBe(3);
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = filterAndPaginate(rows, q, 2, 2);
    expect(p2.items).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();
  });

  it("parseLimitCursor caps at MAX", () => {
    const sp = new URLSearchParams("limit=9999");
    const { limit } = parseLimitCursor(sp);
    expect(limit).toBe(500);
  });

  it("encodeCursor roundtrip offset", () => {
    const sp = new URLSearchParams();
    sp.set("cursor", encodeCursor(5));
    expect(parseLimitCursor(sp).offset).toBe(5);
  });

  it("hasPathFindings true keeps only ok rows with pathFindingCodes", () => {
    const q = parseRunListQuery(new URLSearchParams("hasPathFindings=true"));
    expect(matchesRunListQuery(rows[0]!, q)).toBe(false);
    expect(matchesRunListQuery(rows[1]!, q)).toBe(true);
    expect(matchesRunListQuery(rows[2]!, q)).toBe(false);
  });
});
