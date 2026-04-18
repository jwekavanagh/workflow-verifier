import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ActiveInstalls_DistinctInstallId_VerifyStarted_Rolling7dUtc_SQL } from "@/lib/growthMetricsActiveInstallsRolling7d";
import { CrossSurface_ConversionRate_AcquisitionToIntegrate_Rolling7dUtc_SQL } from "@/lib/growthMetricsAcquisitionToIntegrateRolling7d";
import { CrossSurface_ConversionRate_AcquisitionToVerifyOutcome_Rolling7dUtc_SQL } from "@/lib/growthMetricsCrossSurfaceConversionRolling7d";
import { CrossSurface_ConversionRate_IntegrateToVerifyOutcome_Rolling7dUtc_SQL } from "@/lib/growthMetricsIntegrateToVerifyOutcomeRolling7d";
import { CrossSurface_ConversionRate_QualifiedIntegrateToVerifyStarted_Rolling7dUtc_SQL } from "@/lib/growthMetricsQualifiedIntegrateToVerifyStartedRolling7d";
import { CrossSurface_ConversionRate_QualifiedIntegrateToIntegratorScopedVerifyOutcome_Rolling7dUtc_SQL } from "@/lib/growthMetricsQualifiedIntegrateToIntegratorScopedVerifyOutcomeRolling7d";
import { CrossSurface_ConversionRate_QualifiedIntegrateToVerifyOutcome_Rolling7dUtc_SQL } from "@/lib/growthMetricsQualifiedIntegrateToVerifyOutcomeRolling7d";
import { Counts_QualifiedVerifyOutcomesByTerminalStatus_Rolling7dUtc_SQL } from "@/lib/growthMetricsQualifiedVerifyOutcomeTerminalBucketsRolling7d";
import { Retention_ActiveReserveDays_ge2_Rolling28dUtc_SQL } from "@/lib/growthMetricsRetentionRolling28d";
import { TimeToFirstVerifyOutcome_Seconds_SQL } from "@/lib/growthMetricsTimeToFirstVerifyOutcome";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docPath = join(__dirname, "..", "..", "docs", "growth-metrics-ssot.md");

const METRICS = [
  ["TimeToFirstVerifyOutcome_Seconds", TimeToFirstVerifyOutcome_Seconds_SQL],
  [
    "CrossSurface_ConversionRate_AcquisitionToIntegrate_Rolling7dUtc",
    CrossSurface_ConversionRate_AcquisitionToIntegrate_Rolling7dUtc_SQL,
  ],
  [
    "CrossSurface_ConversionRate_IntegrateToVerifyOutcome_Rolling7dUtc",
    CrossSurface_ConversionRate_IntegrateToVerifyOutcome_Rolling7dUtc_SQL,
  ],
  [
    "CrossSurface_ConversionRate_QualifiedIntegrateToVerifyStarted_Rolling7dUtc",
    CrossSurface_ConversionRate_QualifiedIntegrateToVerifyStarted_Rolling7dUtc_SQL,
  ],
  [
    "CrossSurface_ConversionRate_QualifiedIntegrateToVerifyOutcome_Rolling7dUtc",
    CrossSurface_ConversionRate_QualifiedIntegrateToVerifyOutcome_Rolling7dUtc_SQL,
  ],
  [
    "CrossSurface_ConversionRate_QualifiedIntegrateToIntegratorScopedVerifyOutcome_Rolling7dUtc",
    CrossSurface_ConversionRate_QualifiedIntegrateToIntegratorScopedVerifyOutcome_Rolling7dUtc_SQL,
  ],
  ["Counts_QualifiedVerifyOutcomesByTerminalStatus_Rolling7dUtc", Counts_QualifiedVerifyOutcomesByTerminalStatus_Rolling7dUtc_SQL],
  [
    "CrossSurface_ConversionRate_AcquisitionToVerifyOutcome_Rolling7dUtc",
    CrossSurface_ConversionRate_AcquisitionToVerifyOutcome_Rolling7dUtc_SQL,
  ],
  ["Retention_ActiveReserveDays_ge2_Rolling28dUtc", Retention_ActiveReserveDays_ge2_Rolling28dUtc_SQL],
  [
    "ActiveInstalls_DistinctInstallId_VerifyStarted_Rolling7dUtc",
    ActiveInstalls_DistinctInstallId_VerifyStarted_Rolling7dUtc_SQL,
  ],
] as const;

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function extractSql(md: string, metricId: string): string {
  const escaped = metricId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`### ${escaped}[\\s\\S]*?\`\`\`sql\\s*([\\s\\S]*?)\\s*\`\`\``, "m");
  const m = md.match(re);
  if (!m?.[1]) {
    throw new Error(`Missing sql block for ${metricId}`);
  }
  return norm(m[1]);
}

describe("growthMetricsSqlParity", () => {
  const md = readFileSync(docPath, "utf8");

  for (const [id, tsSql] of METRICS) {
    it(`doc matches TS for ${id}`, () => {
      expect(norm(tsSql)).toBe(extractSql(md, id));
    });
  }
});
