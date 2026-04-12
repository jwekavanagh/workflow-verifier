import { POST as postBillingPortal } from "@/app/api/account/billing-portal/route";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import {
  STRIPE_CUSTOMER_MISSING_ERROR,
  STRIPE_CUSTOMER_MISSING_MESSAGE,
} from "@/lib/billingPortalConstants";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { portalCreate } = vi.hoisted(() => ({
  portalCreate: vi.fn(),
}));

vi.mock("@/lib/stripeServer", () => ({
  getStripe: () => ({
    billingPortal: {
      sessions: {
        create: (...args: unknown[]) => portalCreate(...args),
      },
    },
  }),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

type AuthMock = { mockReset(): void; mockResolvedValue(value: unknown): void };
const authMock = auth as unknown as AuthMock;

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabaseUrl)("POST /api/account/billing-portal", () => {
  beforeEach(async () => {
    authMock.mockReset();
    portalCreate.mockReset();
    await db.execute(sql`
      TRUNCATE funnel_event, stripe_event, usage_reservation, usage_counter, api_key, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE
    `);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await postBillingPortal();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 404 STRIPE_CUSTOMER_MISSING when user has no stripe_customer_id", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "bp-none@example.com", emailVerified: new Date() })
      .returning();
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "bp-none@example.com", name: null },
    });
    const res = await postBillingPortal();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: STRIPE_CUSTOMER_MISSING_ERROR,
      message: STRIPE_CUSTOMER_MISSING_MESSAGE,
    });
  });

  it("returns 404 when stripe_customer_id is whitespace only", async () => {
    const [u] = await db
      .insert(users)
      .values({
        email: "bp-ws@example.com",
        emailVerified: new Date(),
        stripeCustomerId: "   ",
      })
      .returning();
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "bp-ws@example.com", name: null },
    });
    const res = await postBillingPortal();
    expect(res.status).toBe(404);
  });

  it("returns 200 with url and calls Stripe with customer and return_url", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const [u] = await db
      .insert(users)
      .values({
        email: "bp-ok@example.com",
        emailVerified: new Date(),
        stripeCustomerId: "cus_test123",
      })
      .returning();
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "bp-ok@example.com", name: null },
    });
    portalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/test_sess" });

    const res = await postBillingPortal();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      url: "https://billing.stripe.com/session/test_sess",
    });
    expect(portalCreate).toHaveBeenCalledTimes(1);
    expect(portalCreate).toHaveBeenCalledWith({
      customer: "cus_test123",
      return_url: "https://app.example.com/account",
    });
  });

  it("returns 500 when Stripe returns no url", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const [u] = await db
      .insert(users)
      .values({
        email: "bp-nourl@example.com",
        emailVerified: new Date(),
        stripeCustomerId: "cus_x",
      })
      .returning();
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "bp-nourl@example.com", name: null },
    });
    portalCreate.mockResolvedValue({ url: null });

    const res = await postBillingPortal();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Internal Server Error" });
  });

  it("returns 500 when Stripe throws", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const [u] = await db
      .insert(users)
      .values({
        email: "bp-throw@example.com",
        emailVerified: new Date(),
        stripeCustomerId: "cus_y",
      })
      .returning();
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "bp-throw@example.com", name: null },
    });
    portalCreate.mockRejectedValue(new Error("portal_disabled"));

    const res = await postBillingPortal();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Internal Server Error" });
  });

  it("returns 404 STRIPE_CUSTOMER_MISSING and clears DB when Stripe reports missing customer", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const [u] = await db
      .insert(users)
      .values({
        email: "bp-stale-cus@example.com",
        emailVerified: new Date(),
        stripeCustomerId: "cus_deleted_in_stripe",
      })
      .returning();
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "bp-stale-cus@example.com", name: null },
    });
    portalCreate.mockRejectedValue(
      Object.assign(new Error("No such customer: 'cus_deleted_in_stripe'"), {
        code: "resource_missing",
      }),
    );

    const res = await postBillingPortal();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: STRIPE_CUSTOMER_MISSING_ERROR,
      message: STRIPE_CUSTOMER_MISSING_MESSAGE,
    });

    const [row] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, u!.id));
    expect(row?.stripeCustomerId).toBeNull();
  });
});
