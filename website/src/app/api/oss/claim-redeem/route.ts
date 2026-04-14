import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { ossClaimTickets } from "@/db/schema";
import { logFunnelEvent } from "@/lib/funnelEvent";
import { hashOssClaimSecret } from "@/lib/ossClaimSecretHash";
import { ossClaimRedeemRequestSchema } from "@/lib/ossClaimTicketPayload";
import { reserveClaimRedeemUserSlot, withSerializableRetry } from "@/lib/ossClaimRateLimits";

export const runtime = "nodejs";

class RateLimitedClaimRedeemUser extends Error {}

function redeemJson(row: {
  runId: string;
  terminalStatus: string;
  workloadClass: string;
  subcommand: string;
  buildProfile: string;
  claimedAt: Date;
}) {
  return {
    schema_version: 1 as const,
    run_id: row.runId,
    terminal_status: row.terminalStatus,
    workload_class: row.workloadClass,
    subcommand: row.subcommand,
    build_profile: row.buildProfile,
    claimed_at: row.claimedAt.toISOString(),
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse(null, { status: 401 });
  }

  const rawCt = req.headers.get("content-type");
  const ct = rawCt?.toLowerCase() ?? "";
  if (!ct.startsWith("application/json")) {
    return NextResponse.json({ code: "claim_failed" }, { status: 400 });
  }

  let jsonBody: unknown;
  try {
    jsonBody = await req.json();
  } catch {
    return NextResponse.json({ code: "claim_failed" }, { status: 400 });
  }

  const parsed = ossClaimRedeemRequestSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json({ code: "claim_failed" }, { status: 400 });
  }

  const secretHash = hashOssClaimSecret(parsed.data.claim_secret);
  const userId = session.user.id;

  try {
    return await withSerializableRetry(async () =>
      db.transaction(
        async (tx) => {
          const rows = await tx
            .select()
            .from(ossClaimTickets)
            .where(eq(ossClaimTickets.secretHash, secretHash))
            .for("update");

          if (rows.length === 0) {
            return NextResponse.json({ code: "claim_failed" }, { status: 400 });
          }

          const row = rows[0]!;
          const now = new Date();
          if (row.expiresAt.getTime() < now.getTime()) {
            return NextResponse.json({ code: "claim_failed" }, { status: 400 });
          }

          if (row.userId !== null && row.userId !== userId) {
            return NextResponse.json({ code: "already_claimed" }, { status: 409 });
          }

          if (row.userId === userId && row.claimedAt !== null) {
            return NextResponse.json(
              redeemJson({
                runId: row.runId,
                terminalStatus: row.terminalStatus,
                workloadClass: row.workloadClass,
                subcommand: row.subcommand,
                buildProfile: row.buildProfile,
                claimedAt: row.claimedAt,
              }),
              { status: 200 },
            );
          }

          const redeemReserved = await reserveClaimRedeemUserSlot(tx, userId);
          if (!redeemReserved.ok) {
            throw new RateLimitedClaimRedeemUser();
          }

          const claimedAt = new Date();
          await tx
            .update(ossClaimTickets)
            .set({ userId, claimedAt })
            .where(and(eq(ossClaimTickets.secretHash, secretHash)));

          await logFunnelEvent(
            {
              event: "oss_claim_redeemed",
              userId,
              metadata: { schema_version: 1 as const, run_id: row.runId },
            },
            tx,
          );

          return NextResponse.json(
            redeemJson({
              runId: row.runId,
              terminalStatus: row.terminalStatus,
              workloadClass: row.workloadClass,
              subcommand: row.subcommand,
              buildProfile: row.buildProfile,
              claimedAt,
            }),
            { status: 200 },
          );
        },
        { isolationLevel: "serializable" },
      ),
    );
  } catch (e) {
    if (e instanceof RateLimitedClaimRedeemUser) {
      return NextResponse.json(
        { code: "rate_limited", scope: "claim_redeem_user" },
        { status: 429 },
      );
    }
    console.error(e);
    return new NextResponse(null, { status: 503 });
  }
}
