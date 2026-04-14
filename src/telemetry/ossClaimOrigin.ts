import { PUBLIC_CANONICAL_SITE_ORIGIN } from "../publicDistribution.generated.js";

/**
 * OSS claim-ticket POST base (v1): canonical public site origin only — no env overrides.
 * Normative: docs/oss-account-claim-ssot.md
 */
export function resolveOssClaimApiOrigin(): string {
  return PUBLIC_CANONICAL_SITE_ORIGIN.replace(/\/$/, "");
}
