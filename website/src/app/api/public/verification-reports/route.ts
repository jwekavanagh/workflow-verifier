import { getCanonicalSiteOrigin } from "@/lib/canonicalSiteOrigin";
import {
  assertBodySizeWithinLimit,
  insertPublicVerificationReport,
  parseAndValidateEnvelope,
} from "@/lib/publicVerificationReportService";
import { logFunnelEvent } from "@/lib/funnelEvent";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function publicReportsEnabled(): boolean {
  return process.env.PUBLIC_VERIFICATION_REPORTS_ENABLED === "1";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!publicReportsEnabled()) {
    return new NextResponse(null, { status: 503 });
  }
  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    assertBodySizeWithinLimit(rawText);
  } catch (e) {
    if ((e as Error & { status?: number }).status === 413) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    throw e;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const envelope = parseAndValidateEnvelope(parsed);
    const { id } = await insertPublicVerificationReport(envelope);
    const origin = getCanonicalSiteOrigin();
    const url = `${origin.replace(/\/$/, "")}/r/${id}`;
    await logFunnelEvent({ event: "report_share_created", metadata: { id, kind: envelope.kind } });
    return NextResponse.json({ schemaVersion: 1, id, url }, { status: 201 });
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status === 400) {
      return NextResponse.json({ error: "validation_failed" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
