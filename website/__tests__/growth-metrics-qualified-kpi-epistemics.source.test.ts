import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = path.resolve(__dirname, "..", "..");

describe("growth metrics qualified KPI SSOT", () => {
  it("docs/growth-metrics-ssot.md retains qualified integrate metric and must-not", () => {
    const p = path.join(root, "docs", "growth-metrics-ssot.md");
    const body = readFileSync(p, "utf8");

    expect(body).toContain("### CrossSurface_ConversionRate_QualifiedIntegrateToVerifyOutcome_Rolling7dUtc");
    expect(body).toContain("CrossSurface_ConversionRate_QualifiedIntegrateToVerifyOutcome_Rolling7dUtc");
    expect(body).toContain("### CrossSurface_ConversionRate_QualifiedIntegrateToIntegratorScopedVerifyOutcome_Rolling7dUtc");
    expect(body).toContain("Explicit prohibitions");
    expect(body).toContain("workload_class");
    expect(body).toContain("non_bundled");
  });
});
