/** Server-side counterpart to OSS CLI enforce gate — see docs/commercial-enforce-gate-normative.md */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOOKUP = "test_key_lookup_sha256_hex_64_chars________________________________";

const entState = vi.hoisted(() => ({
  plan: "starter" as string,
  subscriptionStatus: "none" as string,
  stripePriceId: undefined as string | undefined,
  txFromCount: 0,
}));

vi.mock("@/lib/apiKeyCrypto", () => ({
  sha256Hex: () => LOOKUP,
  verifyApiKey: () => true,
}));

function makeTx() {
  entState.txFromCount = 0;
  return {
    select: () => ({
      from: () => {
        entState.txFromCount++;
        if (entState.txFromCount === 1) {
          return {
            where: () => ({
              limit: () => Promise.resolve([]),
            }),
          };
        }
        return {
          where: () => ({
            for: () => {
              if (entState.txFromCount === 2) return Promise.resolve([]);
              if (entState.txFromCount === 3) return Promise.resolve([{ count: 0 }]);
              return Promise.resolve([{ count: 1 }]);
            },
          }),
        };
      },
    }),
    insert: () => ({
      values: () => Promise.resolve(undefined),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(undefined),
      }),
    }),
  };
}

vi.mock("@/db/client", () => ({
  db: {
    insert: () => ({
      values: () => Promise.resolve(undefined),
    }),
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([
                {
                  key: {
                    id: "api-key-1",
                    keyHash: "scrypt$ignored",
                    keyLookupSha256: LOOKUP,
                  },
                  user: {
                    plan: entState.plan,
                    subscriptionStatus: entState.subscriptionStatus,
                    stripePriceId: entState.stripePriceId ?? null,
                  },
                },
              ]),
          }),
        }),
      }),
    }),
    transaction: (cb: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
      cb(makeTx()),
  },
}));

describe("POST /api/v1/usage/reserve entitlement", () => {
  beforeEach(() => {
    entState.plan = "starter";
    entState.subscriptionStatus = "none";
    entState.stripePriceId = undefined;
    delete process.env.RESERVE_EMERGENCY_ALLOW;
    process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3000";
  });

  async function postReserve(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/v1/usage/reserve/route");
    const req = new NextRequest("http://localhost/api/v1/usage/reserve", {
      method: "POST",
      headers: {
        authorization: "Bearer wf_sk_test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        run_id: crypto.randomUUID(),
        issued_at: new Date().toISOString(),
        ...body,
      }),
    });
    return POST(req);
  }

  it("starter + enforce → 403 ENFORCEMENT_REQUIRES_PAID_PLAN + upgrade_url", async () => {
    const res = await postReserve({ intent: "enforce" });
    expect(res.status).toBe(403);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.allowed).toBe(false);
    expect(j.code).toBe("ENFORCEMENT_REQUIRES_PAID_PLAN");
    expect(j.upgrade_url).toBe("http://127.0.0.1:3000/pricing");
  });

  it("starter + verify → 403 VERIFICATION_REQUIRES_SUBSCRIPTION + upgrade_url", async () => {
    const res = await postReserve({ intent: "verify" });
    expect(res.status).toBe(403);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.allowed).toBe(false);
    expect(j.code).toBe("VERIFICATION_REQUIRES_SUBSCRIPTION");
    expect(j.upgrade_url).toBe("http://127.0.0.1:3000/pricing");
  });

  it("team + inactive + verify → 403 SUBSCRIPTION_INACTIVE", async () => {
    entState.plan = "team";
    entState.subscriptionStatus = "inactive";
    const res = await postReserve({ intent: "verify" });
    expect(res.status).toBe(403);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.code).toBe("SUBSCRIPTION_INACTIVE");
    expect(j.upgrade_url).toBe("http://127.0.0.1:3000/pricing");
  });

  it("team + active + verify → 200 allowed", async () => {
    entState.plan = "team";
    entState.subscriptionStatus = "active";
    const res = await postReserve({ intent: "verify" });
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.allowed).toBe(true);
  });

  it("team + inactive + enforce → 403 SUBSCRIPTION_INACTIVE", async () => {
    entState.plan = "team";
    entState.subscriptionStatus = "inactive";
    const res = await postReserve({ intent: "enforce" });
    expect(res.status).toBe(403);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.code).toBe("SUBSCRIPTION_INACTIVE");
    expect(j.upgrade_url).toBe("http://127.0.0.1:3000/pricing");
  });

  it("team + active + enforce → 200 allowed", async () => {
    entState.plan = "team";
    entState.subscriptionStatus = "active";
    const res = await postReserve({ intent: "enforce" });
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.allowed).toBe(true);
  });

  it("individual + inactive + verify → 403 SUBSCRIPTION_INACTIVE", async () => {
    entState.plan = "individual";
    entState.subscriptionStatus = "inactive";
    const res = await postReserve({ intent: "verify" });
    expect(res.status).toBe(403);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.code).toBe("SUBSCRIPTION_INACTIVE");
  });

  it("individual + active + verify → 200 allowed", async () => {
    entState.plan = "individual";
    entState.subscriptionStatus = "active";
    const res = await postReserve({ intent: "verify" });
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.allowed).toBe(true);
  });

  it("individual + active + enforce → 200 allowed", async () => {
    entState.plan = "individual";
    entState.subscriptionStatus = "active";
    const res = await postReserve({ intent: "enforce" });
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.allowed).toBe(true);
  });

  it("active subscription + unmapped stripe_price_id → 403 BILLING_PRICE_UNMAPPED + upgrade_url", async () => {
    entState.plan = "team";
    entState.subscriptionStatus = "active";
    entState.stripePriceId = "price_not_mapped_in_this_test_env";
    const res = await postReserve({ intent: "verify" });
    expect(res.status).toBe(403);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.allowed).toBe(false);
    expect(j.code).toBe("BILLING_PRICE_UNMAPPED");
    expect(String(j.message)).toMatch(/STRIPE_PRICE_\*/i);
    expect(String(j.message)).not.toMatch(/billing portal|manage billing|\/account/i);
    expect(j.upgrade_url).toBe("http://127.0.0.1:3000/pricing");
  });

  it("RESERVE_EMERGENCY_ALLOW does not bypass BILLING_PRICE_UNMAPPED", async () => {
    process.env.RESERVE_EMERGENCY_ALLOW = "1";
    entState.plan = "team";
    entState.subscriptionStatus = "inactive";
    entState.stripePriceId = "price_unmapped_emergency";
    const res = await postReserve({ intent: "verify" });
    expect(res.status).toBe(403);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.code).toBe("BILLING_PRICE_UNMAPPED");
  });
});
