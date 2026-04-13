import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { apiKeys, usageCounters, usageReservations, users } from "@/db/schema";
import { sha256Hex, verifyApiKey } from "@/lib/apiKeyCrypto";
import {
  resolveCommercialEntitlement,
  type ReserveIntent,
  type SubscriptionStatusForEntitlement,
} from "@/lib/commercialEntitlement";
import type { PlanId } from "@/lib/plans";
import { buildReserveAllowedMetadata } from "@/lib/funnelCommercialMetadata";
import { logFunnelEvent } from "@/lib/funnelEvent";
import { getCanonicalSiteOrigin } from "@/lib/canonicalSiteOrigin";
import { billingPriceUnmappedMessage } from "@/lib/billingPriceUnmappedMessage";
import { loadCommercialPlans } from "@/lib/plans";
import { priceIdToPlanId } from "@/lib/priceIdToPlanId";

function ymNow(): string {
  return new Date().toISOString().slice(0, 7);
}

function publicUpgradeUrl(): string {
  const base = getCanonicalSiteOrigin().replace(/\/$/, "");
  return `${base}/pricing`;
}

function parseIntent(raw: unknown): ReserveIntent | null {
  if (raw === undefined || raw === null) return "verify";
  if (raw === "verify" || raw === "enforce") return raw;
  return null;
}

function normalizeSubscriptionStatus(
  raw: string,
): SubscriptionStatusForEntitlement | null {
  if (raw === "none" || raw === "active" || raw === "inactive") return raw;
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json(
      { allowed: false, code: "BAD_REQUEST", message: "Missing Authorization Bearer token." },
      { status: 400 },
    );
  }
  const rawKey = auth.slice(7).trim();
  let body: { run_id?: string; issued_at?: string; intent?: unknown };
  try {
    body = (await req.json()) as { run_id?: string; issued_at?: string; intent?: unknown };
  } catch {
    return NextResponse.json(
      { allowed: false, code: "BAD_REQUEST", message: "Invalid JSON body." },
      { status: 400 },
    );
  }
  const intent = parseIntent(body.intent);
  if (intent === null) {
    return NextResponse.json(
      { allowed: false, code: "BAD_REQUEST", message: "Invalid intent." },
      { status: 400 },
    );
  }
  const runId = body.run_id?.trim();
  const issuedAt = body.issued_at;
  if (!runId || runId.length > 256) {
    return NextResponse.json(
      { allowed: false, code: "BAD_REQUEST", message: "Invalid run_id." },
      { status: 400 },
    );
  }
  if (!issuedAt) {
    return NextResponse.json(
      { allowed: false, code: "BAD_REQUEST", message: "Missing issued_at." },
      { status: 400 },
    );
  }
  const t = Date.parse(issuedAt);
  if (Number.isNaN(t)) {
    return NextResponse.json(
      { allowed: false, code: "BAD_REQUEST", message: "Invalid issued_at." },
      { status: 400 },
    );
  }
  if (Math.abs(Date.now() - t) > 300_000) {
    return NextResponse.json(
      { allowed: false, code: "BAD_REQUEST", message: "issued_at skew too large." },
      { status: 400 },
    );
  }

  const lookup = sha256Hex(rawKey);
  const keyRows = await db
    .select({
      key: apiKeys,
      user: users,
    })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyLookupSha256, lookup), isNull(apiKeys.revokedAt)))
    .limit(1);

  const row = keyRows[0];
  if (!row) {
    return NextResponse.json(
      { allowed: false, code: "INVALID_KEY", message: "Unknown or revoked API key." },
      { status: 401 },
    );
  }

  const ok = verifyApiKey(rawKey, row.key.keyHash);
  if (!ok) {
    return NextResponse.json(
      { allowed: false, code: "INVALID_KEY", message: "Invalid API key." },
      { status: 401 },
    );
  }

  const plans = loadCommercialPlans();
  const planId = row.user.plan as PlanId;
  const planDef = plans.plans[planId];
  if (!planDef) {
    return NextResponse.json(
      { allowed: false, code: "SUBSCRIPTION_INACTIVE", message: "Invalid plan configuration." },
      { status: 403 },
    );
  }

  const subNorm = normalizeSubscriptionStatus(row.user.subscriptionStatus);
  if (subNorm === null) {
    return NextResponse.json(
      {
        allowed: false,
        code: "SERVER_ERROR",
        message: "Invalid subscription_status in database.",
      },
      { status: 500 },
    );
  }

  const stripePriceIdRaw = row.user.stripePriceId?.trim();
  if (stripePriceIdRaw && priceIdToPlanId(stripePriceIdRaw) === null) {
    const upgrade_url = publicUpgradeUrl();
    console.error(
      JSON.stringify({
        kind: "reserve_billing_price_unmapped",
        stripePriceId: stripePriceIdRaw,
        plan: planId,
        subscriptionStatus: subNorm,
      }),
    );
    return NextResponse.json(
      {
        allowed: false,
        code: "BILLING_PRICE_UNMAPPED",
        message: billingPriceUnmappedMessage(stripePriceIdRaw),
        upgrade_url,
      },
      { status: 403 },
    );
  }

  const emergencyAllow = process.env.RESERVE_EMERGENCY_ALLOW === "1";
  const ent = resolveCommercialEntitlement({
    planId,
    subscriptionStatus: subNorm,
    intent,
    emergencyAllow,
  });

  if (!ent.proceedToQuota) {
    const upgrade_url = publicUpgradeUrl();
    const message =
      ent.denyCode === "ENFORCEMENT_REQUIRES_PAID_PLAN"
        ? "Enforcing correctness in workflows requires a paid plan."
        : ent.denyCode === "VERIFICATION_REQUIRES_SUBSCRIPTION"
          ? "Licensed contract verification requires an active subscription. Subscribe (trial available) from pricing, then use your API key with the commercial CLI."
          : "Subscription is not active for licensed verification or CI enforcement.";
    console.error(
      JSON.stringify({
        kind: "reserve_entitlement_deny",
        intent,
        plan: planId,
        subscriptionStatus: subNorm,
        code: ent.denyCode,
      }),
    );
    return NextResponse.json(
      {
        allowed: false,
        code: ent.denyCode,
        message,
        upgrade_url,
      },
      { status: 403 },
    );
  }

  const limit =
    planDef.includedMonthly === null ? Number.MAX_SAFE_INTEGER : planDef.includedMonthly;

  const yearMonth = ymNow();

  try {
    const result = await db.transaction(async (tx) => {
      const dup = await tx
        .select()
        .from(usageReservations)
        .where(
          and(eq(usageReservations.apiKeyId, row.key.id), eq(usageReservations.runId, runId)),
        )
        .limit(1);
      if (dup.length > 0) {
        let c = await tx
          .select()
          .from(usageCounters)
          .where(
            and(
              eq(usageCounters.apiKeyId, row.key.id),
              eq(usageCounters.yearMonth, yearMonth),
            ),
          )
          .for("update");
        if (c.length === 0) {
          await tx.insert(usageCounters).values({
            apiKeyId: row.key.id,
            yearMonth,
            count: 0,
          });
          c = await tx
            .select()
            .from(usageCounters)
            .where(
              and(
                eq(usageCounters.apiKeyId, row.key.id),
                eq(usageCounters.yearMonth, yearMonth),
              ),
            )
            .for("update");
        }
        const used = c[0]?.count ?? 0;
        return {
          allowed: true as const,
          plan: planId,
          limit: limit === Number.MAX_SAFE_INTEGER ? used : limit,
          used,
        };
      }

      let locked = await tx
        .select()
        .from(usageCounters)
        .where(
          and(
            eq(usageCounters.apiKeyId, row.key.id),
            eq(usageCounters.yearMonth, yearMonth),
          ),
        )
        .for("update");

      if (locked.length === 0) {
        await tx.insert(usageCounters).values({
          apiKeyId: row.key.id,
          yearMonth,
          count: 0,
        });
        locked = await tx
          .select()
          .from(usageCounters)
          .where(
            and(
              eq(usageCounters.apiKeyId, row.key.id),
              eq(usageCounters.yearMonth, yearMonth),
            ),
          )
          .for("update");
      }

      const used = locked[0]!.count;

      if (used >= limit) {
        return {
          denied: true as const,
          code: "QUOTA_EXCEEDED" as const,
          message: "Monthly verification quota exceeded.",
        };
      }

      await tx.insert(usageReservations).values({
        apiKeyId: row.key.id,
        runId,
      });

      const newCount = used + 1;
      await tx
        .update(usageCounters)
        .set({ count: newCount })
        .where(
          and(
            eq(usageCounters.apiKeyId, row.key.id),
            eq(usageCounters.yearMonth, yearMonth),
          ),
        );

      return {
        allowed: true as const,
        plan: planId,
        limit: limit === Number.MAX_SAFE_INTEGER ? newCount : limit,
        used: newCount,
      };
    });

    if ("denied" in result && result.denied) {
      return NextResponse.json(
        { allowed: false, code: result.code, message: result.message },
        { status: 403 },
      );
    }

    await logFunnelEvent({
      event: "reserve_allowed",
      userId: row.user.id,
      metadata: buildReserveAllowedMetadata(intent),
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { allowed: false, code: "SERVER_ERROR", message: "Reservation failed." },
      { status: 503 },
    );
  }
}
