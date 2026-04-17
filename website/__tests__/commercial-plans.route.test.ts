import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/commercial/plans/route";

describe("GET /api/v1/commercial/plans", () => {
  it("returns schemaVersion and public plan fields without stripe env keys", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      schemaVersion: number;
      plans: Record<
        string,
        {
          displayPrice: string;
          marketingHeadline: string;
          includedMonthly: number | null;
        }
      >;
    };
    expect(j.schemaVersion).toBe(1);
    expect(j.plans.starter?.marketingHeadline).toBe("Starter");
    expect(j.plans.starter?.includedMonthly).toBe(0);
    expect(j.plans.individual?.displayPrice).toBe("$25/mo");
    expect(j.plans.team?.displayPrice).toBe("$100/mo");
    const raw = JSON.stringify(j);
    expect(raw).not.toMatch(/stripePriceEnvKey|STRIPE_PRICE/i);
  });
});
