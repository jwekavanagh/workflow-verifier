import {
  DEMO_ERROR_CODES,
  demoVerifyRequestSchema,
} from "@/lib/demoVerify.contract";
import {
  DemoEngineFailedError,
  DemoResultSchemaMismatchError,
  runDemoVerifyScenario,
} from "@/lib/demoVerify";
import { logFunnelEvent } from "@/lib/funnelEvent";
import { DemoFixturesMissingError } from "@/lib/resolveRepoExamples";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, error: DEMO_ERROR_CODES.METHOD_NOT_ALLOWED },
    { status: 405 },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawCt = req.headers.get("content-type");
  const ct = rawCt?.toLowerCase() ?? "";
  if (!ct.startsWith("application/json")) {
    return NextResponse.json(
      { ok: false, error: DEMO_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE },
      { status: 415 },
    );
  }

  let jsonBody: unknown;
  try {
    jsonBody = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: DEMO_ERROR_CODES.INVALID_JSON },
      { status: 400 },
    );
  }

  const parsed = demoVerifyRequestSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: DEMO_ERROR_CODES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  try {
    const out = await runDemoVerifyScenario(parsed.data.scenarioId);
    await logFunnelEvent({ event: "demo_verify_ok" });
    return NextResponse.json({
      ok: true as const,
      scenarioId: out.scenarioId,
      workflowResult: out.workflowResult,
      truthReportText: out.truthReportText,
    });
  } catch (e) {
    if (e instanceof DemoFixturesMissingError) {
      return NextResponse.json(
        { ok: false, error: DEMO_ERROR_CODES.FIXTURES_MISSING },
        { status: 503 },
      );
    }
    if (e instanceof DemoEngineFailedError) {
      return NextResponse.json(
        { ok: false, error: DEMO_ERROR_CODES.ENGINE_FAILED },
        { status: 500 },
      );
    }
    if (e instanceof DemoResultSchemaMismatchError) {
      return NextResponse.json(
        { ok: false, error: DEMO_ERROR_CODES.RESULT_SCHEMA_MISMATCH },
        { status: 500 },
      );
    }
    throw e;
  }
}
