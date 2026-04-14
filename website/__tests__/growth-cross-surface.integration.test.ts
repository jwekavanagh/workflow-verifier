import { POST as postProductActivation } from "@/app/api/funnel/product-activation/route";
import { POST as postSurface } from "@/app/api/funnel/surface-impression/route";
import { db } from "@/db/client";
import { funnelEvents } from "@/db/schema";
import { getCanonicalSiteOrigin } from "@/lib/canonicalSiteOrigin";
import { getCrossSurfaceConversionRolling7d } from "@/lib/growthMetricsCrossSurfaceConversionRolling7d";
import { getTimeToFirstVerifyOutcomeSeconds } from "@/lib/growthMetricsTimeToFirstVerifyOutcome";
import {
  PRODUCT_ACTIVATION_CLI_PRODUCT_HEADER,
  PRODUCT_ACTIVATION_CLI_VERSION_HEADER,
} from "@/lib/funnelProductActivationConstants";
import { eq, sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootPkgPath = join(__dirname, "..", "..", "package.json");
const cliSemver = JSON.parse(readFileSync(rootPkgPath, "utf8")).version as string;

function surfaceReq(body: object, origin: string | null): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  return new NextRequest("http://127.0.0.1:3000/api/funnel/surface-impression", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function activationReq(body: object): NextRequest {
  const h = new Headers({ "content-type": "application/json" });
  h.set(PRODUCT_ACTIVATION_CLI_PRODUCT_HEADER, "cli");
  h.set(PRODUCT_ACTIVATION_CLI_VERSION_HEADER, cliSemver);
  return new NextRequest("http://127.0.0.1:3000/api/funnel/product-activation", {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
}

describe.skipIf(!hasDatabaseUrl)("growth cross-surface metrics", () => {
  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE oss_claim_ticket, oss_claim_rate_limit_counter, product_activation_started_beacon, product_activation_outcome_beacon, verify_outcome_beacon, funnel_event, stripe_event, usage_reservation, usage_counter, api_key, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE
    `);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("joins acquisition_landed to verify_outcome on same funnel_anon_id with ordered timestamps", async () => {
    const canonical = getCanonicalSiteOrigin();
    const fid = "b5c0ee2f-4f1a-4c1a-8a1a-111111111111";
    const sRes = await postSurface(
      surfaceReq(
        {
          surface: "acquisition",
          funnel_anon_id: fid,
          attribution: { landing_path: "/integrate" },
        },
        canonical,
      ),
    );
    expect(sRes.status).toBe(200);
    const issued = new Date().toISOString();
    const outBody = {
      event: "verify_outcome" as const,
      schema_version: 1 as const,
      run_id: "run-cross-surface-1",
      issued_at: issued,
      workload_class: "non_bundled" as const,
      subcommand: "batch_verify" as const,
      build_profile: "oss" as const,
      terminal_status: "complete" as const,
      funnel_anon_id: fid,
    };
    const pRes = await postProductActivation(activationReq(outBody));
    expect(pRes.status).toBe(204);

    const acq = await db
      .select()
      .from(funnelEvents)
      .where(eq(funnelEvents.event, "acquisition_landed"));
    const out = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "verify_outcome"));
    expect(acq).toHaveLength(1);
    expect(out).toHaveLength(1);
    expect((acq[0]!.metadata as { funnel_anon_id?: string }).funnel_anon_id).toBe(fid);
    expect((out[0]!.metadata as { funnel_anon_id?: string }).funnel_anon_id).toBe(fid);
    expect(acq[0]!.createdAt.getTime()).toBeLessThanOrEqual(out[0]!.createdAt.getTime());
  });

  it("TimeToFirstVerifyOutcome_Seconds returns 42 for seeded timestamps", async () => {
    const fid = "c6d1ff30-5a2b-4d2b-8b2b-222222222222";
    const base = Date.now();
    await db.insert(funnelEvents).values([
      {
        event: "acquisition_landed",
        userId: null,
        metadata: {
          schema_version: 1,
          surface: "acquisition",
          funnel_anon_id: fid,
          attribution: {},
        },
        createdAt: new Date(base - 50_000),
      },
      {
        event: "verify_outcome",
        userId: null,
        metadata: {
          schema_version: 1,
          run_id: "seed-run",
          issued_at: new Date().toISOString(),
          workload_class: "non_bundled",
          subcommand: "batch_verify",
          build_profile: "oss",
          terminal_status: "complete",
          funnel_anon_id: fid,
        },
        createdAt: new Date(base - 8000),
      },
    ]);
    const sec = await getTimeToFirstVerifyOutcomeSeconds(fid);
    expect(sec).toBe(42);
  });

  it("CrossSurface_ConversionRate rolling 7d returns D=2 N=1 rate 0.5", async () => {
    const fa = "d7e2aa41-6b3c-4e3c-ac3c-333333333333";
    const fb = "e8f3bb52-7c4d-4f4d-bd4d-444444444444";
    const now = new Date();
    await db.insert(funnelEvents).values([
      {
        event: "acquisition_landed",
        userId: null,
        metadata: {
          schema_version: 1,
          surface: "acquisition",
          funnel_anon_id: fa,
          attribution: {},
        },
        createdAt: now,
      },
      {
        event: "acquisition_landed",
        userId: null,
        metadata: {
          schema_version: 1,
          surface: "acquisition",
          funnel_anon_id: fb,
          attribution: {},
        },
        createdAt: now,
      },
      {
        event: "verify_outcome",
        userId: null,
        metadata: {
          schema_version: 1,
          run_id: "r-a",
          issued_at: now.toISOString(),
          workload_class: "non_bundled",
          subcommand: "batch_verify",
          build_profile: "oss",
          terminal_status: "complete",
          funnel_anon_id: fa,
        },
        createdAt: now,
      },
    ]);
    const r = await getCrossSurfaceConversionRolling7d();
    expect(r.d).toBe(2);
    expect(r.n).toBe(1);
    expect(r.rate).toBeCloseTo(0.5, 5);
  });
});
