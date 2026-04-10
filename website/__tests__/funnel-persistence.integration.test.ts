import { POST as postCreateKey } from "@/app/api/account/create-key/route";
import { POST as postCheckout } from "@/app/api/checkout/route";
import { POST as postDemo } from "@/app/api/demo/verify/route";
import { db } from "@/db/client";
import { funnelEvents, users } from "@/db/schema";
import { applyStripeWebhookEvent } from "@/lib/applyStripeWebhookEvent";
import { recordSignInFunnel } from "@/lib/recordSignInFunnel";
import { sql, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/stripeServer", () => ({
  getStripe: vi.fn(),
}));

import { auth } from "@/auth";
import { getStripe } from "@/lib/stripeServer";

beforeAll(() => {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for funnel-persistence.integration.test.ts");
  }
});

async function truncateAll(): Promise<void> {
  await db.execute(sql`
    TRUNCATE funnel_event, stripe_event, usage_reservation, usage_counter, api_key, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE
  `);
}

beforeEach(async () => {
  await truncateAll();
  vi.mocked(auth).mockReset();
  vi.mocked(getStripe).mockReset();
});

describe("CHECK constraint on funnel_event.event", () => {
  it("rejects invalid event with 23514", async () => {
    await expect(
      db.execute(sql`INSERT INTO funnel_event (event) VALUES ('invalid_event_literal')`),
    ).rejects.toSatisfy((e: unknown) => {
      const err = e as { code?: string; cause?: { code?: string } };
      return err.code === "23514" || err.cause?.code === "23514";
    });
  });
});

describe("demo_verify_ok", () => {
  it("inserts funnel row on success", async () => {
    const req = new NextRequest("http://localhost/api/demo/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioId: "wf_complete" }),
    });
    const res = await postDemo(req);
    expect(res.status).toBe(200);
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "demo_verify_ok"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.userId).toBeNull();
  });
});

describe("negative demo", () => {
  it("does not insert demo_verify_ok for bad scenario", async () => {
    const req = new NextRequest("http://localhost/api/demo/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioId: "nope_not_a_demo_scenario" }),
    });
    const res = await postDemo(req);
    expect(res.status).toBe(400);
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "demo_verify_ok"));
    expect(rows.length).toBe(0);
  });
});

describe("sign_in", () => {
  it("recordSignInFunnel persists", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "signin-1@example.com", emailVerified: new Date() })
      .returning();
    await recordSignInFunnel(u!.id);
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "sign_in"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(u!.id);
  });
});

describe("checkout_started", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("logs after Stripe session create", async () => {
    vi.stubEnv("STRIPE_PRICE_TEAM", "price_test_123");
    const [u] = await db
      .insert(users)
      .values({ email: "checkout-1@example.com", emailVerified: new Date() })
      .returning();
    vi.mocked(auth).mockResolvedValue({
      user: { id: u!.id, email: "checkout-1@example.com", name: null },
    } as Awaited<ReturnType<typeof auth>>);
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
    expect(rows[0]?.userId).toBe(u!.id);
  });
});

describe("unauthenticated checkout", () => {
  it("returns 401 and does not insert checkout_started", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "team" }),
    });
    const res = await postCheckout(req);
    expect(res.status).toBe(401);
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "checkout_started"));
    expect(rows.length).toBe(0);
  });
});

describe("subscription_checkout_completed", () => {
  it("applyStripeWebhookEvent updates user and logs funnel", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "sub-1@example.com", emailVerified: new Date(), plan: "starter" })
      .returning();
    const event = {
      id: `evt_test_${crypto.randomUUID()}`,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          object: "checkout.session",
          metadata: { userId: u!.id, plan: "team" },
          customer: "cus_x",
          subscription: "sub_x",
        },
      },
    } as unknown as Stripe.Event;

    await applyStripeWebhookEvent(event);

    const row = await db.select().from(users).where(eq(users.id, u!.id)).limit(1);
    expect(row[0]?.plan).toBe("team");
    expect(row[0]?.subscriptionStatus).toBe("active");
    const fun = await db
      .select()
      .from(funnelEvents)
      .where(eq(funnelEvents.event, "subscription_checkout_completed"));
    expect(fun).toHaveLength(1);
    expect(fun[0]?.userId).toBe(u!.id);
  });
});

describe("api_key_created", () => {
  it("logs after key creation", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "key-1@example.com", emailVerified: new Date() })
      .returning();
    vi.mocked(auth).mockResolvedValue({
      user: { id: u!.id, email: "key-1@example.com", name: null },
    } as Awaited<ReturnType<typeof auth>>);

    const res = await postCreateKey();
    expect(res.status).toBe(200);
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "api_key_created"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(u!.id);
  });
});
