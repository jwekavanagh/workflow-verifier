export const FUNNEL_EVENT_NAMES = [
  "demo_verify_ok",
  "sign_in",
  "checkout_started",
  "subscription_checkout_completed",
  "api_key_created",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];
