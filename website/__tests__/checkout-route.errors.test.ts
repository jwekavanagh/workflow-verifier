import { POST } from "@/app/api/checkout/route";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));

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

describe("POST /api/checkout — JSON error contract", () => {
  beforeEach(() => {
    limitMock.mockReset();
    limitMock
      .mockResolvedValueOnce([{ stripeCustomerId: null as string | null }])
      .mockResolvedValueOnce([]);
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-checkout-errors", email: "checkout-errors@example.com", name: null },
    } as never);
    vi.stubEnv("STRIPE_PRICE_TEAM", "price_checkout_errors_team");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(getStripe).mockReset();
    vi.mocked(logFunnelEvent).mockClear();
  });

  it("returns application/json with an error message when Stripe session create throws", async () => {
    vi.mocked(getStripe).mockReturnValue({
      checkout: {
        sessions: {
          create: vi.fn().mockRejectedValue(new Error("STRIPE_SECRET_KEY is not configured")),
        },
      },
    } as unknown as ReturnType<typeof getStripe>);

    const req = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "team" }),
    });
    const res = await POST(req);

    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "CHECKOUT_FAILED" });
    expect(JSON.stringify(body)).not.toContain("STRIPE_SECRET_KEY");
    expect(logFunnelEvent).not.toHaveBeenCalled();
  });

  it("returns application/json 502 when Stripe omits checkout.url", async () => {
    vi.mocked(getStripe).mockReturnValue({
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: null }),
        },
      },
    } as unknown as ReturnType<typeof getStripe>);

    const req = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "team" }),
    });
    const res = await POST(req);

    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("CHECKOUT_FAILED");
    expect(JSON.stringify(body)).not.toMatch(/redirect URL/i);
    expect(logFunnelEvent).not.toHaveBeenCalled();
  });
});
