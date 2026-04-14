import { GET as getCommercialState } from "@/app/api/account/commercial-state/route";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { CommercialAccountStatePayload } from "@/lib/commercialAccountState";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

type AuthSessionValue =
  | {
      user: { id: string; email: string; name: string | null };
    }
  | null;
type AuthMock = {
  mockReset(): void;
  mockResolvedValue(value: AuthSessionValue): void;
};
const authMock = auth as unknown as AuthMock;

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabaseUrl)("GET /api/account/commercial-state", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await db.execute(sql`
      TRUNCATE oss_claim_ticket, oss_claim_rate_limit_counter, product_activation_started_beacon, product_activation_outcome_beacon, verify_outcome_beacon, funnel_event, stripe_event, usage_reservation, usage_counter, api_key, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE
    `);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await getCommercialState(new NextRequest("http://localhost/api/account/commercial-state"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid expectedPlan", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "cs-bad@example.com", emailVerified: new Date() })
      .returning();
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "cs-bad@example.com", name: null },
    });
    const res = await getCommercialState(
      new NextRequest("http://localhost/api/account/commercial-state?expectedPlan=enterprise"),
    );
    expect(res.status).toBe(400);
  });

  it("returns checkoutActivationReady true when team active and price mapped", async () => {
    vi.stubEnv("STRIPE_PRICE_TEAM", "price_cs_team");
    const [u] = await db
      .insert(users)
      .values({
        email: "cs-ok@example.com",
        emailVerified: new Date(),
        plan: "team",
        subscriptionStatus: "active",
        stripePriceId: "price_cs_team",
        stripeCustomerId: "cus_cs_ok",
      })
      .returning();
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "cs-ok@example.com", name: null },
    });
    const res = await getCommercialState(
      new NextRequest("http://localhost/api/account/commercial-state?expectedPlan=team"),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as CommercialAccountStatePayload;
    expect(j.checkoutActivationReady).toBe(true);
    expect(j.plan).toBe("team");
    expect(j.priceMapping).toBe("mapped");
    expect(j.hasStripeCustomer).toBe(true);
    expect(j.entitlementSummary).toContain("is enabled");
    expect(j.monthlyQuota).toBeDefined();
    expect(j.monthlyQuota.worstUrgency).toBe("ok");
    expect(Array.isArray(j.monthlyQuota.keys)).toBe(true);
  });

  it("returns checkoutActivationReady false without expectedPlan query", async () => {
    const [u] = await db
      .insert(users)
      .values({
        email: "cs-noexp@example.com",
        emailVerified: new Date(),
        plan: "team",
        subscriptionStatus: "active",
        stripePriceId: "price_x",
      })
      .returning();
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "cs-noexp@example.com", name: null },
    });
    const res = await getCommercialState(new NextRequest("http://localhost/api/account/commercial-state"));
    expect(res.status).toBe(200);
    const j = (await res.json()) as CommercialAccountStatePayload;
    expect(j.checkoutActivationReady).toBe(false);
    expect(j.hasStripeCustomer).toBe(false);
    expect(j.monthlyQuota.keys.length).toBe(0);
  });

  it("returns billingPriceSyncHint when subscription price is not in env mapping", async () => {
    vi.stubEnv("CONTACT_SALES_EMAIL", "billing-hint-ci@example.com");
    const [u] = await db
      .insert(users)
      .values({
        email: "cs-unmapped@example.com",
        emailVerified: new Date(),
        plan: "individual",
        subscriptionStatus: "active",
        stripePriceId: "price_from_stripe_only",
        stripeCustomerId: "cus_x",
      })
      .returning();
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "cs-unmapped@example.com", name: null },
    });
    const res = await getCommercialState(new NextRequest("http://localhost/api/account/commercial-state"));
    expect(res.status).toBe(200);
    const j = (await res.json()) as CommercialAccountStatePayload;
    expect(j.priceMapping).toBe("unmapped");
    expect(j.billingPriceSyncHint).toEqual({
      supportEmail: "billing-hint-ci@example.com",
    });
  });
});
