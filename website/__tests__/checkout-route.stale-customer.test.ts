import { POST } from "@/app/api/checkout/route";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { limitMock, setMock, updateMock } = vi.hoisted(() => {
  const setMock = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
  const limitMock = vi.fn();
  const updateMock = vi.fn(() => ({ set: setMock }));
  return { limitMock, setMock, updateMock };
});

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: limitMock,
        }),
      }),
    }),
    update: updateMock,
  },
}));

vi.mock("@/lib/stripeServer", () => ({
  getStripe: vi.fn(),
}));

vi.mock("@/lib/funnelEvent", () => ({
  logFunnelEvent: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from "@/auth";
import { getStripe } from "@/lib/stripeServer";
import { logFunnelEvent } from "@/lib/funnelEvent";

describe("POST /api/checkout — stale stripe_customer_id", () => {
  beforeEach(() => {
    limitMock.mockReset();
    limitMock
      .mockResolvedValueOnce([{ stripeCustomerId: "cus_stale_vitest" }])
      .mockResolvedValueOnce([]);
    setMock.mockClear();
    updateMock.mockClear();
    vi.mocked(setMock).mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-stale-cus", email: "stale-cus@example.com", name: null },
    } as Awaited<ReturnType<typeof auth>>);
    vi.stubEnv("STRIPE_PRICE_TEAM", "price_stale_cus_team");
    vi.mocked(logFunnelEvent).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(getStripe).mockReset();
    vi.mocked(logFunnelEvent).mockClear();
  });

  it("clears stripe_customer_id and retries checkout with customer_email when customer is missing in Stripe", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("No such customer: 'cus_stale_vitest'"), {
          type: "StripeInvalidRequestError",
          code: "resource_missing",
        }),
      )
      .mockResolvedValueOnce({ url: "https://checkout.stripe.com/c/pay/cs_test_after_retry" });

    vi.mocked(getStripe).mockReturnValue({
      checkout: { sessions: { create: create } },
    } as unknown as ReturnType<typeof getStripe>);

    const req = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "team" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      url: "https://checkout.stripe.com/c/pay/cs_test_after_retry",
    });
    expect(create).toHaveBeenCalledTimes(2);
    const firstArg = create.mock.calls[0]![0] as { customer?: string; customer_email?: string };
    const secondArg = create.mock.calls[1]![0] as { customer?: string; customer_email?: string };
    expect(firstArg.customer).toBe("cus_stale_vitest");
    expect(secondArg.customer).toBeUndefined();
    expect(secondArg.customer_email).toBe("stale-cus@example.com");

    expect(updateMock).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith({ stripeCustomerId: null });
    expect(logFunnelEvent).toHaveBeenCalledTimes(1);
  });
});
