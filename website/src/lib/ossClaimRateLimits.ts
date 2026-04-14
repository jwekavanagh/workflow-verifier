import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ossClaimRateLimitCounters } from "@/db/schema";
import { utcHourStart } from "@/lib/magicLinkSendGate";

export const OSS_CLAIM_TICKET_IP_CAP = 60;
export const OSS_CLAIM_REDEEM_USER_CAP = 30;

export type OssClaimRateScope = "claim_ticket_ip" | "claim_redeem_user";

export type WebsiteDbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function isSerializationFailure(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  if (err.code === "40001" || err.cause?.code === "40001") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /serialization failure|could not serialize access/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function serializationBackoffMs(attempt: number): number {
  return Math.min(220, 5 * 2 ** Math.min(attempt, 8));
}

export async function reserveClaimTicketIpSlot(
  tx: WebsiteDbTransaction,
  ipKey: string,
): Promise<{ ok: true } | { ok: false }> {
  const H = utcHourStart();
  const scope: OssClaimRateScope = "claim_ticket_ip";

  const locked = await tx
    .select()
    .from(ossClaimRateLimitCounters)
    .where(
      and(
        eq(ossClaimRateLimitCounters.scope, scope),
        eq(ossClaimRateLimitCounters.windowStart, H),
        eq(ossClaimRateLimitCounters.scopeKey, ipKey),
      ),
    )
    .for("update");

  if (locked.length === 0) {
    await tx.insert(ossClaimRateLimitCounters).values({
      scope,
      windowStart: H,
      scopeKey: ipKey,
      count: 1,
    });
    return { ok: true };
  }

  const c = locked[0]!.count;
  if (c >= OSS_CLAIM_TICKET_IP_CAP) {
    return { ok: false };
  }

  await tx
    .update(ossClaimRateLimitCounters)
    .set({ count: sql`${ossClaimRateLimitCounters.count} + 1` })
    .where(
      and(
        eq(ossClaimRateLimitCounters.scope, scope),
        eq(ossClaimRateLimitCounters.windowStart, H),
        eq(ossClaimRateLimitCounters.scopeKey, ipKey),
      ),
    );

  return { ok: true };
}

export async function reserveClaimRedeemUserSlot(
  tx: WebsiteDbTransaction,
  userId: string,
): Promise<{ ok: true } | { ok: false }> {
  const H = utcHourStart();
  const scope: OssClaimRateScope = "claim_redeem_user";

  const locked = await tx
    .select()
    .from(ossClaimRateLimitCounters)
    .where(
      and(
        eq(ossClaimRateLimitCounters.scope, scope),
        eq(ossClaimRateLimitCounters.windowStart, H),
        eq(ossClaimRateLimitCounters.scopeKey, userId),
      ),
    )
    .for("update");

  if (locked.length === 0) {
    await tx.insert(ossClaimRateLimitCounters).values({
      scope,
      windowStart: H,
      scopeKey: userId,
      count: 1,
    });
    return { ok: true };
  }

  const c = locked[0]!.count;
  if (c >= OSS_CLAIM_REDEEM_USER_CAP) {
    return { ok: false };
  }

  await tx
    .update(ossClaimRateLimitCounters)
    .set({ count: sql`${ossClaimRateLimitCounters.count} + 1` })
    .where(
      and(
        eq(ossClaimRateLimitCounters.scope, scope),
        eq(ossClaimRateLimitCounters.windowStart, H),
        eq(ossClaimRateLimitCounters.scopeKey, userId),
      ),
    );

  return { ok: true };
}

export async function withSerializableRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 64;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isSerializationFailure(e) || attempt === maxAttempts - 1) throw e;
      await sleep(serializationBackoffMs(attempt));
    }
  }
  throw new Error("withSerializableRetry: exhausted");
}
