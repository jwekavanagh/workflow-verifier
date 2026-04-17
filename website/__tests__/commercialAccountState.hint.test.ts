import {
  buildCommercialAccountStatePayload,
  computeWorstUrgency,
  emptyMonthlyQuotaForTests,
} from "@/lib/commercialAccountState";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("buildCommercialAccountStatePayload billingPriceSyncHint", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is null when price maps", () => {
    vi.stubEnv("STRIPE_PRICE_INDIVIDUAL", "price_ok");
    const p = buildCommercialAccountStatePayload({
      plan: "individual",
      subscriptionStatus: "active",
      stripePriceId: "price_ok",
      expectedPlan: null,
      operatorContactEmail: "ops@example.com",
      monthlyQuota: emptyMonthlyQuotaForTests(),
    });
    expect(p.priceMapping).toBe("mapped");
    expect(p.billingPriceSyncHint).toBeNull();
  });

  it("returns support email when unmapped and operator email is valid", () => {
    vi.stubEnv("STRIPE_PRICE_INDIVIDUAL", "price_other");
    const p = buildCommercialAccountStatePayload({
      plan: "individual",
      subscriptionStatus: "active",
      stripePriceId: "price_on_subscription",
      expectedPlan: null,
      operatorContactEmail: "billing@example.com",
      monthlyQuota: emptyMonthlyQuotaForTests(),
    });
    expect(p.priceMapping).toBe("unmapped");
    expect(p.billingPriceSyncHint).toEqual({
      supportEmail: "billing@example.com",
    });
  });

  it("returns null supportEmail when operator contact is invalid", () => {
    const p = buildCommercialAccountStatePayload({
      plan: "individual",
      subscriptionStatus: "active",
      stripePriceId: "price_orphan",
      expectedPlan: null,
      operatorContactEmail: "not-an-email",
      monthlyQuota: emptyMonthlyQuotaForTests(),
    });
    expect(p.priceMapping).toBe("unmapped");
    expect(p.billingPriceSyncHint).toEqual({ supportEmail: null });
  });

  it("includes hint for starter when price is unmapped", () => {
    const p = buildCommercialAccountStatePayload({
      plan: "starter",
      subscriptionStatus: "active",
      stripePriceId: "price_orphan",
      expectedPlan: null,
      operatorContactEmail: "ops@example.com",
      monthlyQuota: emptyMonthlyQuotaForTests(),
    });
    expect(p.priceMapping).toBe("unmapped");
    expect(p.billingPriceSyncHint).toEqual({ supportEmail: "ops@example.com" });
  });
});

describe("computeWorstUrgency", () => {
  it("treats limit 0 as evaluation tier (no at_cap when used is 0)", () => {
    expect(computeWorstUrgency([{ apiKeyId: "k1", label: "API key", used: 0, limit: 0 }])).toBe("ok");
  });

  it("treats limit 0 as evaluation tier when used is positive (e.g. after downgrade)", () => {
    expect(computeWorstUrgency([{ apiKeyId: "k1", label: "API key", used: 5, limit: 0 }])).toBe("ok");
  });

  it("still applies at_cap for positive limits", () => {
    expect(computeWorstUrgency([{ apiKeyId: "k1", label: "API key", used: 10, limit: 10 }])).toBe("at_cap");
  });

  it("skips null limits (enterprise) and uses positive key limits", () => {
    expect(
      computeWorstUrgency([
        { apiKeyId: "k1", label: "API key", used: 0, limit: null },
        { apiKeyId: "k2", label: "API key", used: 2000, limit: 2000 },
      ]),
    ).toBe("at_cap");
  });
});
