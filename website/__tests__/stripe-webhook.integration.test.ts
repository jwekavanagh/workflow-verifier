import { POST as postStripeWebhook } from "@/app/api/webhooks/stripe/route";
import { db } from "@/db/client";
import { stripeEvents, users } from "@/db/schema";
import * as webhookSide from "@/lib/applyStripeWebhookDbSide";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stripeServer", () => ({
  getStripe: vi.fn(),
}));

import { getStripe } from "@/lib/stripeServer";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabaseUrl)("stripe webhook integration", () => {
  async function truncateStripeAndUsers(): Promise<void> {
    await db.execute(sql`
      TRUNCATE stripe_event, funnel_event, "user" RESTART IDENTITY CASCADE
    `);
  }

  beforeEach(async () => {
    await truncateStripeAndUsers();
    vi.mocked(getStripe).mockReset();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_fixture");
    vi.stubEnv("STRIPE_PRICE_TEAM", "price_wh_team");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function mockConstructAndRetrieve(event: Stripe.Event, retrieveResult?: unknown): void {
    vi.mocked(getStripe).mockReturnValue({
      webhooks: {
        constructEvent: vi.fn().mockReturnValue(event),
      },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue(
          retrieveResult ?? {
            id: "sub_wh",
            customer: "cus_wh",
            status: "active",
            items: { data: [{ price: { id: "price_wh_team" } }] },
          },
        ),
      },
    } as unknown as ReturnType<typeof getStripe>);
  }

  function webhookRequest(): NextRequest {
    return new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=fake" },
      body: "{}",
    });
  }

  it("retry after apply failure leaves no stripe_event then succeeds on second delivery", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "wh-retry@example.com", emailVerified: new Date(), plan: "starter" })
      .returning();

    const event = {
      id: "evt_retry_fixture",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_retry",
          object: "checkout.session",
          metadata: { userId: u!.id, plan: "team" },
          customer: "cus_wh",
          subscription: "sub_wh",
        },
      },
    } as unknown as Stripe.Event;

    mockConstructAndRetrieve(event);

    const spy = vi
      .spyOn(webhookSide, "applyStripeWebhookDbSide")
      .mockRejectedValueOnce(new Error("injected_apply_failure"));

    const res1 = await postStripeWebhook(webhookRequest());
    expect(res1.status).toBe(500);
    spy.mockRestore();

    const rowsAfterFail = await db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id));
    expect(rowsAfterFail).toHaveLength(0);

    mockConstructAndRetrieve(event);
    const res2 = await postStripeWebhook(webhookRequest());
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { received?: boolean; duplicate?: boolean };
    expect(body2.received).toBe(true);
    expect(body2.duplicate).toBeUndefined();

    const rowsOk = await db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id));
    expect(rowsOk).toHaveLength(1);
    const row = await db.select().from(users).where(eq(users.id, u!.id)).limit(1);
    expect(row[0]?.plan).toBe("team");
  });

  it("serial duplicate delivery returns duplicate and does not change user", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "wh-dup@example.com", emailVerified: new Date(), plan: "starter" })
      .returning();

    const event = {
      id: "evt_serial_dup",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_dup",
          object: "checkout.session",
          metadata: { userId: u!.id, plan: "team" },
          customer: "cus_wh",
          subscription: "sub_wh",
        },
      },
    } as unknown as Stripe.Event;

    mockConstructAndRetrieve(event);
    const res1 = await postStripeWebhook(webhookRequest());
    expect(res1.status).toBe(200);

    mockConstructAndRetrieve(event);
    const res2 = await postStripeWebhook(webhookRequest());
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { duplicate?: boolean };
    expect(body2.duplicate).toBe(true);

    const evRows = await db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id));
    expect(evRows).toHaveLength(1);
  });

  it("parallel deliveries for same event.id commit one stripe_event row", async () => {
    const [u] = await db
      .insert(users)
      .values({
        email: "wh-par@example.com",
        emailVerified: new Date(),
        plan: "starter",
        stripeCustomerId: "cus_par",
        stripeSubscriptionId: "sub_par",
      })
      .returning();

    const event = {
      id: "evt_parallel_fixture",
      object: "event",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_par",
          object: "subscription",
          customer: "cus_par",
          status: "active",
          items: { data: [{ price: { id: "price_wh_team" } }] },
        },
      },
    } as unknown as Stripe.Event;

    vi.mocked(getStripe).mockReturnValue({
      webhooks: {
        constructEvent: vi.fn().mockReturnValue(event),
      },
    } as unknown as ReturnType<typeof getStripe>);

    const req = webhookRequest();
    const [resA, resB] = await Promise.all([postStripeWebhook(req), postStripeWebhook(req)]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const bodies = await Promise.all([resA.json(), resB.json()]);
    const dupCount = bodies.filter((b) => (b as { duplicate?: boolean }).duplicate === true).length;
    expect(dupCount).toBe(1);
    const receivedBoth = bodies.every((b) => (b as { received?: boolean }).received === true);
    expect(receivedBoth).toBe(true);

    const evRows = await db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id));
    expect(evRows).toHaveLength(1);

    const row = await db.select().from(users).where(eq(users.id, u!.id)).limit(1);
    expect(row[0]?.plan).toBe("team");
  });

  it("rejects duplicate stripe_event id without ON CONFLICT (unique PK)", async () => {
    await db.insert(stripeEvents).values({ id: "evt_pk_dup" });
    await expect(db.insert(stripeEvents).values({ id: "evt_pk_dup" })).rejects.toSatisfy((e: unknown) => {
      const err = e as { code?: string; cause?: { code?: string } };
      return err.code === "23505" || err.cause?.code === "23505";
    });
  });
});
