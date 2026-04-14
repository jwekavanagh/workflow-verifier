import { POST as postCreateKey } from "@/app/api/account/create-key/route";
import { POST as postRevokeKey } from "@/app/api/account/revoke-key/route";
import { POST as postReserve } from "@/app/api/v1/usage/reserve/route";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

type AuthMock = { mockResolvedValue(v: unknown): void; mockReset(): void };
const authMock = auth as unknown as AuthMock;

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabaseUrl)("revoke-key integration", () => {
  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE oss_claim_ticket, oss_claim_rate_limit_counter, product_activation_started_beacon, product_activation_outcome_beacon, verify_outcome_beacon, funnel_event, stripe_event, usage_reservation, usage_counter, api_key, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE
    `);
    authMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns revoked true then false; old key fails reserve", async () => {
    const [u] = await db
      .insert(users)
      .values({
        email: "revoke-1@example.com",
        emailVerified: new Date(),
        plan: "team",
        subscriptionStatus: "active",
      })
      .returning();
    authMock.mockResolvedValue({
      user: { id: u!.id, email: "revoke-1@example.com", name: null },
    });

    const keyRes = await postCreateKey();
    expect(keyRes.status).toBe(200);
    const { apiKey } = (await keyRes.json()) as { apiKey: string };

    const r1 = await postRevokeKey();
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ ok: true, revoked: true });

    const r2 = await postRevokeKey();
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ ok: true, revoked: false });

    const reserveReq = new NextRequest("http://localhost/api/v1/usage/reserve", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        run_id: crypto.randomUUID(),
        issued_at: new Date().toISOString(),
        intent: "verify",
      }),
    });
    const reserveRes = await postReserve(reserveReq);
    expect(reserveRes.status).toBe(401);
  });

  it("returns 401 UNAUTHORIZED when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await postRevokeKey();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
  });
});
