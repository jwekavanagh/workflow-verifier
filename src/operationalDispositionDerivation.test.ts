import { describe, expect, it } from "vitest";
import { CLI_OPERATIONAL_CODES, type OperationalCode } from "./cliOperationalCodes.js";
import {
  OPERATIONAL_CODE_TO_ACTIONABLE_CATEGORY,
  OPERATIONAL_CODE_TO_AUTOMATION_SAFE,
  OPERATIONAL_CODE_TO_RECOMMENDED_ACTION,
  OPERATIONAL_CODE_TO_SEVERITY,
} from "./actionableFailure.js";
import {
  OPERATIONAL_CODE_TO_ORIGIN,
  OPERATIONAL_CODE_TO_SUMMARY,
} from "./failureOriginCatalog.js";
import { OPERATIONAL_DISPOSITION } from "./operationalDisposition.js";

describe("operationalDispositionDerivation", () => {
  it("exported operational maps match OPERATIONAL_DISPOSITION for every OperationalCode", () => {
    for (const k of Object.keys(CLI_OPERATIONAL_CODES) as OperationalCode[]) {
      const row = OPERATIONAL_DISPOSITION[k];
      expect(OPERATIONAL_CODE_TO_ORIGIN[k]).toBe(row.origin);
      expect(OPERATIONAL_CODE_TO_SUMMARY[k]).toBe(row.summary);
      expect(OPERATIONAL_CODE_TO_ACTIONABLE_CATEGORY[k]).toBe(row.actionableCategory);
      expect(OPERATIONAL_CODE_TO_SEVERITY[k]).toBe(row.actionableSeverity);
      expect(OPERATIONAL_CODE_TO_RECOMMENDED_ACTION[k]).toBe(row.recommendedAction);
      expect(OPERATIONAL_CODE_TO_AUTOMATION_SAFE[k]).toBe(row.automationSafe);
    }
  });
});
