import { POST as postCreateKey } from "@/app/api/account/create-key/route";
import { POST as postCheckout } from "@/app/api/checkout/route";
import { POST as postReserve } from "@/app/api/v1/usage/reserve/route";
import { db } from "@/db/client";
import { funnelEvents, users } from "@/db/schema";
import { buildReserveAllowedMetadata } from "@/lib/funnelCommercialMetadata";
import { countDistinctReserveDaysForUser } from "@/lib/funnelObservabilityQueries";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/stripeServer", () => ({
  getStripe: vi.fn(),
}));

import { auth } from "@/auth";
import { getStripe } from "@/lib/stripeServer";

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

describe.skipIf(!hasDatabaseUrl)("funnel observability chain", () => {
  async function truncateAll(): Promise<void> {
    await db.execute(sql`
    TRUNCATE oss_claim_ticket, oss_claim_rate_limit_counter, product_activation_started_beacon, product_activation_outcome_beacon, verify_outcome_beacon, funnel_event, stripe_event, usage_reservation, usage_counter, api_key, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE
  `);
  }

  beforeEach(async () => {
    await truncateAll();
    authMock.mockReset();
    vi.mocked(getStripe).mockReset();
  });

  describe("funnel observability — activation chain", () => {
  it("postCreateKey logs api_key_created; postReserve logs reserve_allowed with metadata", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "obs-chain-1@example.com", emailVerified: new Date() })
      .returning();
    await db
      .update(users)
      .set({ plan: "team", subscriptionStatus: "active" })
      .where(eq(users.id, u!.id));
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "obs-chain-1@example.com", name: null },
    });

    const keyRes = await postCreateKey();
    expect(keyRes.status).toBe(200);
    const keyBody = (await keyRes.json()) as { apiKey?: string };
    expect(keyBody.apiKey).toBeTruthy();

    const createdRows = await db
      .select()
      .from(funnelEvents)
      .where(eq(funnelEvents.event, "api_key_created"));
    expect(createdRows.length).toBeGreaterThanOrEqual(1);
    expect(createdRows.some((r) => r.userId === u!.id)).toBe(true);

    const reserveReq = new NextRequest("http://localhost/api/v1/usage/reserve", {
      method: "POST",
      headers: {
        authorization: `Bearer ${keyBody.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        run_id: crypto.randomUUID(),
        issued_at: new Date().toISOString(),
        intent: "verify",
      }),
    });
    const reserveRes = await postReserve(reserveReq);
    expect(reserveRes.status).toBe(200);

    const allowedRows = await db
      .select()
      .from(funnelEvents)
      .where(eq(funnelEvents.event, "reserve_allowed"));
    expect(allowedRows.length).toBeGreaterThanOrEqual(1);
    const mine = allowedRows.filter((r) => r.userId === u!.id);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    expect(mine[0]?.metadata).toEqual(buildReserveAllowedMetadata("verify"));
  });

  it("postReserve with invalid key does not insert reserve_allowed", async () => {
    const req = new NextRequest("http://localhost/api/v1/usage/reserve", {
      method: "POST",
      headers: {
        authorization: "Bearer wf_invalid_key_not_in_db",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        run_id: crypto.randomUUID(),
        issued_at: new Date().toISOString(),
        intent: "verify",
      }),
    });
    const res = await postReserve(req);
    expect(res.status).toBe(401);
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "reserve_allowed"));
    expect(rows).toHaveLength(0);
  });
});

describe("funnel observability — checkout post_activation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("checkout_started has post_activation false when user has no reserve_allowed", async () => {
    vi.stubEnv("STRIPE_PRICE_TEAM", "price_test_obs_123");
    const [u] = await db
      .insert(users)
      .values({ email: "obs-checkout-cold@example.com", emailVerified: new Date() })
      .returning();
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "obs-checkout-cold@example.com", name: null },
    });
    vi.mocked(getStripe).mockReturnValue({
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: "https://example.invalid/checkout" }),
        },
      },
    } as unknown as ReturnType<typeof getStripe>);

    const req = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "team" }),
    });
    const res = await postCheckout(req);
    expect(res.status).toBe(200);
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "checkout_started"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toEqual({
      schema_version: 1,
      plan: "team",
      post_activation: false,
    });
  });

  it("checkout_started has post_activation true after reserve_allowed", async () => {
    vi.stubEnv("STRIPE_PRICE_BUSINESS", "price_test_obs_biz");
    const [u] = await db
      .insert(users)
      .values({ email: "obs-checkout-warm@example.com", emailVerified: new Date() })
      .returning();
    await db
      .update(users)
      .set({ plan: "team", subscriptionStatus: "active" })
      .where(eq(users.id, u!.id));
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "obs-checkout-warm@example.com", name: null },
    });

    const keyRes = await postCreateKey();
    const keyBody = (await keyRes.json()) as { apiKey?: string };
    const reserveReq = new NextRequest("http://localhost/api/v1/usage/reserve", {
      method: "POST",
      headers: {
        authorization: `Bearer ${keyBody.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        run_id: crypto.randomUUID(),
        issued_at: new Date().toISOString(),
        intent: "verify",
      }),
    });
    expect((await postReserve(reserveReq)).status).toBe(200);

    vi.mocked(getStripe).mockReturnValue({
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: "https://example.invalid/checkout" }),
        },
      },
    } as unknown as ReturnType<typeof getStripe>);

    const checkoutReq = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "business" }),
    });
    const checkoutRes = await postCheckout(checkoutReq);
    expect(checkoutRes.status).toBe(200);
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "checkout_started"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toEqual({
      schema_version: 1,
      plan: "business",
      post_activation: true,
    });
  });
});

describe("funnel observability — repeat days (countDistinctReserveDaysForUser)", () => {
  it("counts two distinct UTC dates as 2", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "obs-repeat-2@example.com", emailVerified: new Date() })
      .returning();
    const meta = buildReserveAllowedMetadata("verify");
    await db.insert(funnelEvents).values({
      event: "reserve_allowed",
      userId: u!.id,
      metadata: meta,
      createdAt: new Date("2026-06-01T15:00:00.000Z"),
    });
    await db.insert(funnelEvents).values({
      event: "reserve_allowed",
      userId: u!.id,
      metadata: meta,
      createdAt: new Date("2026-06-02T15:00:00.000Z"),
    });
    const n = await countDistinctReserveDaysForUser(u!.id);
    expect(n).toBe(2);
  });

  it("counts two events same UTC date as 1", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "obs-repeat-1@example.com", emailVerified: new Date() })
      .returning();
    const meta = buildReserveAllowedMetadata("verify");
    await db.insert(funnelEvents).values({
      event: "reserve_allowed",
      userId: u!.id,
      metadata: meta,
      createdAt: new Date("2026-07-10T08:00:00.000Z"),
    });
    await db.insert(funnelEvents).values({
      event: "reserve_allowed",
      userId: u!.id,
      metadata: meta,
      createdAt: new Date("2026-07-10T20:00:00.000Z"),
    });
    const n = await countDistinctReserveDaysForUser(u!.id);
    expect(n).toBe(1);
  });
});

});
