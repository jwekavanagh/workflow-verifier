import { describe, expect, it } from "vitest";
import {
  formatQuickVerifyHumanReport,
  QUICK_VERIFY_BANNER_LINE_1,
  QUICK_VERIFY_BANNER_LINE_2,
  QUICK_VERIFY_BANNER_LINE_3,
} from "./formatQuickVerifyHumanReport.js";
import { HUMAN_REPORT_BEGIN, HUMAN_REPORT_END, verdictLine } from "./quickVerifyHumanCopy.js";
import { DEFAULT_QUICK_VERIFY_SCOPE } from "./quickVerifyScope.js";
import { DEFAULT_QUICK_VERIFY_PRODUCT_TRUTH } from "./quickVerifyProductTruth.js";
import type { QuickVerifyReport } from "./runQuickVerify.js";

function minimalReport(verdict: "pass" | "fail" | "uncertain"): QuickVerifyReport {
  return {
    schemaVersion: 4,
    verdict,
    summary: `Inferred provisional check — rollup ${verdict} is not a production-safety or audit-final verdict. 0 unit(s).`,
    verificationMode: "inferred",
    scope: { ...DEFAULT_QUICK_VERIFY_SCOPE },
    productTruth: DEFAULT_QUICK_VERIFY_PRODUCT_TRUTH,
    ingest: { reasonCodes: ["INGEST_NO_ACTIONS"], malformedLineCount: 0 },
    units: [],
    exportableRegistry: { tools: [] },
  };
}

describe("formatQuickVerifyHumanReport", () => {
  it("first three lines are exact anchors for uncertain", () => {
    const out = formatQuickVerifyHumanReport(minimalReport("uncertain"));
    const lines = out.split("\n");
    expect(lines[0]).toBe(HUMAN_REPORT_BEGIN);
    expect(lines[1]).toBe(verdictLine("uncertain"));
    expect(lines[2]).toBe(HUMAN_REPORT_END);
    expect(lines[3]).toBe(QUICK_VERIFY_BANNER_LINE_1);
    expect(lines[4]).toBe(QUICK_VERIFY_BANNER_LINE_2);
    expect(lines[5]).toBe(QUICK_VERIFY_BANNER_LINE_3);
    expect(lines.length).toBeGreaterThan(6);
  });

  it("first three lines are exact anchors for pass and fail", () => {
    for (const v of ["pass", "fail"] as const) {
      const out = formatQuickVerifyHumanReport(minimalReport(v));
      const lines = out.split("\n");
      expect(lines[0]).toBe(HUMAN_REPORT_BEGIN);
      expect(lines[1]).toBe(verdictLine(v));
      expect(lines[2]).toBe(HUMAN_REPORT_END);
    }
  });
});
