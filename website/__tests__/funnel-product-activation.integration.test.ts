import { POST as postProductActivation } from "@/app/api/funnel/product-activation/route";
import { db } from "@/db/client";
import { funnelEvents, productActivationOutcomeBeacons, productActivationStartedBeacons } from "@/db/schema";
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

function activationReq(body: object, headers?: Record<string, string>): NextRequest {
  const h = new Headers({ "content-type": "application/json" });
  h.set(PRODUCT_ACTIVATION_CLI_PRODUCT_HEADER, "cli");
  h.set(PRODUCT_ACTIVATION_CLI_VERSION_HEADER, cliSemver);
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      h.set(k, v);
    }
  }
  return new NextRequest("http://127.0.0.1:3000/api/funnel/product-activation", {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
}

describe.skipIf(!hasDatabaseUrl)("funnel product-activation", () => {
  async function truncateAll(): Promise<void> {
    await db.execute(sql`
    TRUNCATE oss_claim_ticket, oss_claim_rate_limit_counter, product_activation_started_beacon, product_activation_outcome_beacon, verify_outcome_beacon, funnel_event, stripe_event, usage_reservation, usage_counter, api_key, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE
  `);
  }

  beforeEach(async () => {
    await truncateAll();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const issuedNow = new Date().toISOString();
  const startedBody = {
    event: "verify_started" as const,
    schema_version: 1 as const,
    run_id: "run-activation-test-1",
    issued_at: issuedNow,
    workload_class: "non_bundled" as const,
    subcommand: "batch_verify" as const,
    build_profile: "oss" as const,
  };

  it("returns 204 and inserts verify_started once; duplicate returns 204 with one funnel row", async () => {
    const req1 = activationReq(startedBody);
    const res1 = await postProductActivation(req1);
    expect(res1.status).toBe(204);
    const rows1 = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "verify_started"));
    expect(rows1).toHaveLength(1);
    const beacons1 = await db.select().from(productActivationStartedBeacons);
    expect(beacons1).toHaveLength(1);

    const req2 = activationReq(startedBody);
    const res2 = await postProductActivation(req2);
    expect(res2.status).toBe(204);
    const rows2 = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "verify_started"));
    expect(rows2).toHaveLength(1);
  });

  it("returns 204 for verify_outcome with dedupe", async () => {
    const rid = "run-outcome-dedupe";
    const body = {
      event: "verify_outcome" as const,
      schema_version: 1 as const,
      run_id: rid,
      issued_at: new Date().toISOString(),
      workload_class: "bundled_examples" as const,
      subcommand: "quick_verify" as const,
      build_profile: "commercial" as const,
      terminal_status: "complete" as const,
    };
    expect((await postProductActivation(activationReq(body))).status).toBe(204);
    expect((await postProductActivation(activationReq(body))).status).toBe(204);
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "verify_outcome"));
    expect(rows).toHaveLength(1);
    const beacons = await db.select().from(productActivationOutcomeBeacons);
    expect(beacons).toHaveLength(1);
  });

  it("returns 400 when issued_at skew is too large", async () => {
    const old = new Date(Date.now() - 400_000).toISOString();
    const res = await postProductActivation(
      activationReq({
        ...startedBody,
        issued_at: old,
      }),
    );
    expect(res.status).toBe(400);
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "verify_started"));
    expect(rows).toHaveLength(0);
  });

  it("returns 403 without valid CLI headers", async () => {
    const h = new Headers({ "content-type": "application/json" });
    const req = new NextRequest("http://127.0.0.1:3000/api/funnel/product-activation", {
      method: "POST",
      headers: h,
      body: JSON.stringify(startedBody),
    });
    const res = await postProductActivation(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when funnel_anon_id is not a valid UUIDv4", async () => {
    const res = await postProductActivation(
      activationReq({
        ...startedBody,
        funnel_anon_id: "not-a-uuid",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 204 and persists funnel_anon_id in metadata when valid", async () => {
    const fid = "a0000000-0000-4000-8000-000000000099";
    const res = await postProductActivation(
      activationReq({
        ...startedBody,
        run_id: "run-with-fid",
        funnel_anon_id: fid,
      }),
    );
    expect(res.status).toBe(204);
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "verify_started"));
    expect((rows[0]!.metadata as { funnel_anon_id?: string }).funnel_anon_id).toBe(fid);
  });

  it("returns 413 when Content-Length exceeds cap", async () => {
    const h = new Headers({ "content-type": "application/json" });
    h.set(PRODUCT_ACTIVATION_CLI_PRODUCT_HEADER, "cli");
    h.set(PRODUCT_ACTIVATION_CLI_VERSION_HEADER, cliSemver);
    h.set("content-length", "999999");
    const req = new NextRequest("http://127.0.0.1:3000/api/funnel/product-activation", {
      method: "POST",
      headers: h,
      body: JSON.stringify(startedBody),
    });
    const res = await postProductActivation(req);
    expect(res.status).toBe(413);
  });
});
