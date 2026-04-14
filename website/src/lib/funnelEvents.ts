export const FUNNEL_EVENT_NAMES = [
  "demo_verify_ok",
  "sign_in",
  "checkout_started",
  "subscription_checkout_completed",
  "api_key_created",
  "reserve_allowed",
  "report_share_created",
  "report_share_view",
  "acquisition_landed",
  "integrate_landed",
  "licensed_verify_outcome",
  "verify_started",
  "verify_outcome",
  "oss_claim_redeemed",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];
