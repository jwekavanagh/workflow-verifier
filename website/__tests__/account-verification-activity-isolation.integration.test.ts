import { db } from "@/db/client";
import { funnelEvents, users } from "@/db/schema";
import { buildLicensedVerifyOutcomeMetadata } from "@/lib/funnelCommercialMetadata";
import { loadAccountPageVerificationActivity } from "@/lib/funnelObservabilityQueries";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabaseUrl)("loadAccountPageVerificationActivity (integration)", () => {
  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE oss_claim_ticket, oss_claim_rate_limit_counter, product_activation_started_beacon, product_activation_outcome_beacon, verify_outcome_beacon, funnel_event, stripe_event, usage_reservation, usage_counter, api_key, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE
    `);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isolates rows per user_id within the billing month", async () => {
    const [ua] = await db
      .insert(users)
      .values({ email: "iso-a@example.com", emailVerified: new Date() })
      .returning();
    const [ub] = await db
      .insert(users)
      .values({ email: "iso-b@example.com", emailVerified: new Date() })
      .returning();
    const meta = buildLicensedVerifyOutcomeMetadata({
      terminal_status: "complete",
      workload_class: "bundled_examples",
      subcommand: "batch_verify",
    });
    const tA1 = new Date(Date.UTC(2026, 3, 5, 10, 0, 0));
    const tA2 = new Date(Date.UTC(2026, 3, 8, 10, 0, 0));
    const tB1 = new Date(Date.UTC(2026, 3, 6, 10, 0, 0));
    await db.insert(funnelEvents).values([
      { event: "licensed_verify_outcome", userId: ua!.id, metadata: meta, createdAt: tA1 },
      { event: "licensed_verify_outcome", userId: ua!.id, metadata: meta, createdAt: tA2 },
      { event: "licensed_verify_outcome", userId: ub!.id, metadata: meta, createdAt: tB1 },
    ]);

    const ym = "2026-04";
    const forA = await loadAccountPageVerificationActivity(ua!.id, ym);
    expect(forA.ok).toBe(true);
    if (forA.ok !== true) throw new Error("expected ok");
    expect(forA.licensedOutcomesThisUtcMonth).toBe(2);
    expect(forA.rows).toHaveLength(2);
    expect(forA.rows[0]!.createdAtIso).toBe(tA2.toISOString());
    expect(forA.rows[1]!.createdAtIso).toBe(tA1.toISOString());

    const forB = await loadAccountPageVerificationActivity(ub!.id, ym);
    expect(forB.ok).toBe(true);
    if (forB.ok !== true) throw new Error("expected ok");
    expect(forB.licensedOutcomesThisUtcMonth).toBe(1);
    expect(forB.rows).toHaveLength(1);
    expect(forB.rows[0]!.createdAtIso).toBe(tB1.toISOString());
  });

  it("returns ok false when the first db.select rejects (month count)", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "fail1@example.com", emailVerified: new Date() })
      .returning();
    const selectSpy = vi.spyOn(db, "select").mockRejectedValueOnce(new Error("forced_first_select"));
    try {
      const got = await loadAccountPageVerificationActivity(u!.id, "2026-04");
      expect(got).toEqual({ ok: false });
      expect(selectSpy).toHaveBeenCalledTimes(1);
    } finally {
      selectSpy.mockRestore();
    }
  });

  it("returns ok false when the second db.select rejects (candidates) after count succeeds", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "fail2@example.com", emailVerified: new Date() })
      .returning();

    const monthCountChain = {
      from: () => monthCountChain,
      where: () => Promise.resolve([{ n: 0 }]),
    };

    const selectSpy = vi
      .spyOn(db, "select")
      .mockImplementationOnce(() => monthCountChain as never)
      .mockRejectedValueOnce(new Error("forced_second_select"));

    try {
      const got = await loadAccountPageVerificationActivity(u!.id, "2026-04");
      expect(got).toEqual({ ok: false });
      expect(selectSpy).toHaveBeenCalledTimes(2);
      expect(Object.keys(selectSpy.mock.calls[0]![0] as Record<string, unknown>).sort()).toEqual(["n"]);
      expect(Object.keys(selectSpy.mock.calls[1]![0] as Record<string, unknown>).sort()).toEqual([
        "createdAt",
        "metadata",
      ]);
      expect(selectSpy.mock.calls[0]![0]).toEqual(expect.objectContaining({ n: expect.anything() }));
      expect(selectSpy.mock.calls[1]![0]).toEqual(
        expect.objectContaining({
          createdAt: expect.anything(),
          metadata: expect.anything(),
        }),
      );
    } finally {
      selectSpy.mockRestore();
    }
  });
});
