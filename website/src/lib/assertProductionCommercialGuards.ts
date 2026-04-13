import { isProductionLike } from "@/lib/canonicalSiteOrigin";

export const PRODUCTION_COMMERCIAL_GUARD_VIOLATION_MESSAGE =
  "AGENTSKEPTIC_PRODUCTION_COMMERCIAL_GUARD_VIOLATION: E2E_COMMERCIAL_FUNNEL and RESERVE_EMERGENCY_ALLOW must not be enabled when VERCEL_ENV=production";

/**
 * Throws if production-like deployment has forbidden commercial test / break-glass flags.
 * Called from `instrumentation.ts` `register()` on server cold start.
 */
export function assertProductionCommercialGuards(): void {
  if (!isProductionLike()) {
    return;
  }
  if (
    process.env.E2E_COMMERCIAL_FUNNEL === "1" ||
    process.env.RESERVE_EMERGENCY_ALLOW === "1"
  ) {
    throw new Error(PRODUCTION_COMMERCIAL_GUARD_VIOLATION_MESSAGE);
  }
}
