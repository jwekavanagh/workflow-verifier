import { POST as postCreateKey } from "@/app/api/account/create-key/route";
import { POST as postSurface } from "@/app/api/funnel/surface-impression/route";
import { POST as postReserve } from "@/app/api/v1/usage/reserve/route";
import { POST as postVerifyOutcome } from "@/app/api/v1/funnel/verify-outcome/route";
import { db } from "@/db/client";
import { funnelEvents, usageReservations, users } from "@/db/schema";
import { getCanonicalSiteOrigin } from "@/lib/canonicalSiteOrigin";
import { VERIFY_OUTCOME_BEACON_MAX_RESERVATION_AGE_MS } from "@/lib/funnelVerifyOutcomeConstants";
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

function surfaceReq(body: object, origin: string | null): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  return new NextRequest("http://127.0.0.1:3000/api/funnel/surface-impression", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe.skipIf(!hasDatabaseUrl)("funnel north star — surface impression", () => {
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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 200 JSON and inserts acquisition_landed when Origin matches canonical", async () => {
    const canonical = getCanonicalSiteOrigin();
    const req = surfaceReq({ surface: "acquisition" }, canonical);
    const res = await postSurface(req);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { schema_version: number; funnel_anon_id: string };
    expect(j.schema_version).toBe(1);
    expect(typeof j.funnel_anon_id).toBe("string");
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "acquisition_landed"));
    expect(rows).toHaveLength(1);
    expect((rows[0]!.metadata as { funnel_anon_id?: string }).funnel_anon_id).toBe(j.funnel_anon_id);
  });

  it("returns 403 without matching Origin or Referer", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.NEXT_PUBLIC_APP_URL;
    const req = surfaceReq({ surface: "integrate" }, "https://evil.example");
    const res = await postSurface(req);
    expect(res.status).toBe(403);
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "integrate_landed"));
    expect(rows).toHaveLength(0);
  });
});

describe.skipIf(!hasDatabaseUrl)("funnel north star — verify-outcome", () => {
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

  it(
    "first POST returns 204 with one licensed_verify_outcome; duplicate returns 204 with one row",
    { timeout: 30_000 },
    async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "funnel-ns-1@example.com", emailVerified: new Date() })
      .returning();
    await db
      .update(users)
      .set({ plan: "team", subscriptionStatus: "active" })
      .where(eq(users.id, u!.id));
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "funnel-ns-1@example.com", name: null },
    });

    const keyRes = await postCreateKey();
    const keyBody = (await keyRes.json()) as { apiKey?: string };
    const runId = crypto.randomUUID();
    expect(
      (
        await postReserve(
          new NextRequest("http://localhost/api/v1/usage/reserve", {
            method: "POST",
            headers: {
              authorization: `Bearer ${keyBody.apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              run_id: runId,
              issued_at: new Date().toISOString(),
              intent: "verify",
            }),
          }),
        )
      ).status,
    ).toBe(200);

    const body = {
      run_id: runId,
      terminal_status: "complete" as const,
      workload_class: "non_bundled" as const,
      subcommand: "batch_verify" as const,
    };
    const headers = {
      authorization: `Bearer ${keyBody.apiKey}`,
      "content-type": "application/json",
    };
    const r1 = await postVerifyOutcome(
      new NextRequest("http://localhost/api/v1/funnel/verify-outcome", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
    expect(r1.status).toBe(204);
    const rows1 = await db
      .select()
      .from(funnelEvents)
      .where(eq(funnelEvents.event, "licensed_verify_outcome"));
    expect(rows1).toHaveLength(1);

    const r2 = await postVerifyOutcome(
      new NextRequest("http://localhost/api/v1/funnel/verify-outcome", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
    expect(r2.status).toBe(204);
    const rows2 = await db
      .select()
      .from(funnelEvents)
      .where(eq(funnelEvents.event, "licensed_verify_outcome"));
    expect(rows2).toHaveLength(1);
    },
  );

  it("returns 401 for invalid bearer token", async () => {
    const res = await postVerifyOutcome(
      new NextRequest("http://localhost/api/v1/funnel/verify-outcome", {
        method: "POST",
        headers: {
          authorization: "Bearer wf_not_a_real_key",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          run_id: crypto.randomUUID(),
          terminal_status: "complete",
          workload_class: "non_bundled",
          subcommand: "batch_verify",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when run_id not reserved for key", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "funnel-ns-404@example.com", emailVerified: new Date() })
      .returning();
    await db
      .update(users)
      .set({ plan: "team", subscriptionStatus: "active" })
      .where(eq(users.id, u!.id));
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "funnel-ns-404@example.com", name: null },
    });
    const keyRes = await postCreateKey();
    const keyBody = (await keyRes.json()) as { apiKey?: string };
    const res = await postVerifyOutcome(
      new NextRequest("http://localhost/api/v1/funnel/verify-outcome", {
        method: "POST",
        headers: {
          authorization: `Bearer ${keyBody.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          run_id: crypto.randomUUID(),
          terminal_status: "complete",
          workload_class: "non_bundled",
          subcommand: "batch_verify",
        }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 410 when reservation is older than 6 hours", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "funnel-ns-410@example.com", emailVerified: new Date() })
      .returning();
    await db
      .update(users)
      .set({ plan: "team", subscriptionStatus: "active" })
      .where(eq(users.id, u!.id));
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "funnel-ns-410@example.com", name: null },
    });
    const keyRes = await postCreateKey();
    const keyBody = (await keyRes.json()) as { apiKey?: string };
    const runId = crypto.randomUUID();
    expect(
      (
        await postReserve(
          new NextRequest("http://localhost/api/v1/usage/reserve", {
            method: "POST",
            headers: {
              authorization: `Bearer ${keyBody.apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              run_id: runId,
              issued_at: new Date().toISOString(),
              intent: "verify",
            }),
          }),
        )
      ).status,
    ).toBe(200);

    const stale = new Date(Date.now() - VERIFY_OUTCOME_BEACON_MAX_RESERVATION_AGE_MS - 60_000);
    await db.update(usageReservations).set({ createdAt: stale }).where(eq(usageReservations.runId, runId));

    const res = await postVerifyOutcome(
      new NextRequest("http://localhost/api/v1/funnel/verify-outcome", {
        method: "POST",
        headers: {
          authorization: `Bearer ${keyBody.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          run_id: runId,
          terminal_status: "complete",
          workload_class: "non_bundled",
          subcommand: "batch_verify",
        }),
      }),
    );
    expect(res.status).toBe(410);
    const rows = await db
      .select()
      .from(funnelEvents)
      .where(eq(funnelEvents.event, "licensed_verify_outcome"));
    expect(rows).toHaveLength(0);
  });
});
