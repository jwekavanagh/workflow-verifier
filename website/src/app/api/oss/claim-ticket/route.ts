import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { ossClaimTickets } from "@/db/schema";
import { extractClientIpKey } from "@/lib/magicLinkSendGate";
import {
  PRODUCT_ACTIVATION_CLI_PRODUCT_HEADER,
  PRODUCT_ACTIVATION_CLI_PRODUCT_VALUE,
  PRODUCT_ACTIVATION_CLI_VERSION_HEADER,
  PRODUCT_ACTIVATION_MAX_BODY_BYTES,
  PRODUCT_ACTIVATION_MAX_ISSUED_AT_SKEW_MS,
} from "@/lib/funnelProductActivationConstants";
import { cliVersionSchema } from "@/lib/funnelProductActivation.contract";
import { hashOssClaimSecret } from "@/lib/ossClaimSecretHash";
import { ossClaimTicketRequestSchema } from "@/lib/ossClaimTicketPayload";
import { expiresAtFromCreated } from "@/lib/ossClaimTicketTtl";
import { reserveClaimTicketIpSlot, withSerializableRetry } from "@/lib/ossClaimRateLimits";

export const runtime = "nodejs";

class RateLimitedClaimTicketIp extends Error {}

function assertProductActivationBodySize(rawUtf8: string): void {
  const bytes = Buffer.byteLength(rawUtf8, "utf8");
  if (bytes > PRODUCT_ACTIVATION_MAX_BODY_BYTES) {
    const err = new Error("PAYLOAD_TOO_LARGE");
    (err as Error & { status: number }).status = 413;
    throw err;
  }
}

function validateIssuedAtSkew(issuedAt: string): boolean {
  const t = Date.parse(issuedAt);
  if (Number.isNaN(t)) return false;
  return Math.abs(Date.now() - t) <= PRODUCT_ACTIVATION_MAX_ISSUED_AT_SKEW_MS;
}

function assertCliHeaders(req: NextRequest): void {
  const product = req.headers.get(PRODUCT_ACTIVATION_CLI_PRODUCT_HEADER)?.trim();
  const versionRaw = req.headers.get(PRODUCT_ACTIVATION_CLI_VERSION_HEADER)?.trim();
  if (product !== PRODUCT_ACTIVATION_CLI_PRODUCT_VALUE) {
    const err = new Error("FORBIDDEN");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  const v = cliVersionSchema.safeParse(versionRaw);
  if (!v.success) {
    const err = new Error("FORBIDDEN");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawCt = req.headers.get("content-type");
  const ct = rawCt?.toLowerCase() ?? "";
  if (!ct.startsWith("application/json")) {
    return new NextResponse(null, { status: 400 });
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    const n = Number(contentLength);
    if (Number.isFinite(n) && n > PRODUCT_ACTIVATION_MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 });
    }
  }

  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  try {
    assertProductActivationBodySize(rawText);
  } catch (e) {
    if ((e as Error & { status?: number }).status === 413) {
      return new NextResponse(null, { status: 413 });
    }
    throw e;
  }

  try {
    assertCliHeaders(req);
  } catch (e) {
    const st = (e as Error & { status?: number }).status;
    if (st === 403) return new NextResponse(null, { status: 403 });
    throw e;
  }

  let jsonBody: unknown;
  try {
    jsonBody = JSON.parse(rawText) as unknown;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const parsed = ossClaimTicketRequestSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return new NextResponse(null, { status: 400 });
  }

  const body = parsed.data;
  if (!validateIssuedAtSkew(body.issued_at)) {
    return new NextResponse(null, { status: 400 });
  }

  const secretHash = hashOssClaimSecret(body.claim_secret);

  try {
    return await withSerializableRetry(async () =>
      db.transaction(
        async (tx) => {
          const existing = await tx
            .select()
            .from(ossClaimTickets)
            .where(eq(ossClaimTickets.secretHash, secretHash))
            .for("update");

          if (existing.length > 0) {
            return new NextResponse(null, { status: 204 });
          }

          const ipKey = extractClientIpKey(req);
          const reserved = await reserveClaimTicketIpSlot(tx, ipKey);
          if (!reserved.ok) {
            throw new RateLimitedClaimTicketIp();
          }

          const createdAt = new Date();
          const telemetrySource =
            "schema_version" in body && body.schema_version === 2
              ? body.telemetry_source
              : "legacy_unattributed";

          await tx.insert(ossClaimTickets).values({
            secretHash,
            runId: body.run_id,
            terminalStatus: body.terminal_status,
            workloadClass: body.workload_class,
            subcommand: body.subcommand,
            buildProfile: body.build_profile,
            issuedAt: body.issued_at,
            telemetrySource,
            createdAt,
            expiresAt: expiresAtFromCreated(createdAt),
          });

          return new NextResponse(null, { status: 204 });
        },
        { isolationLevel: "serializable" },
      ),
    );
  } catch (e) {
    if (e instanceof RateLimitedClaimTicketIp) {
      return NextResponse.json(
        { code: "rate_limited", scope: "claim_ticket_ip" },
        { status: 429 },
      );
    }
    console.error(e);
    return new NextResponse(null, { status: 503 });
  }
}
