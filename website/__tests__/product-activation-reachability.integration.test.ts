import { POST as postProductActivation } from "@/app/api/funnel/product-activation/route";
import { dbTelemetry } from "@/db/telemetryClient";
import { telemetryFunnelEvents } from "@/db/telemetrySchema";
import { truncateCommercialFixtureDbs } from "./helpers/truncateCommercialFixture";
import { productActivationPostRequest } from "./helpers/funnelApiRequests";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";

const isValidator = process.env.ACTIVATION_SPINE_VALIDATOR === "1";
const hasCoreDb = Boolean(process.env.DATABASE_URL?.trim());
const hasTelemetryDb = Boolean(process.env.TELEMETRY_DATABASE_URL?.trim());
const hasBothDbs = hasCoreDb && hasTelemetryDb;

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootPkgPath = path.join(__dirname, "..", "..", "package.json");
const cliSemver = JSON.parse(readFileSync(rootPkgPath, "utf8")).version as string;

describe.skipIf(!isValidator && !hasBothDbs)("product-activation reachability (PR-O3)", () => {
  beforeEach(async () => {
    vi.stubEnv("AGENTSKEPTIC_TELEMETRY_WRITES_TELEMETRY_DB", "1");
    await truncateCommercialFixtureDbs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("403 when CLI marker headers missing", async () => {
    const body = {
      event: "verify_started" as const,
      schema_version: 2 as const,
      run_id: "run-reach-403",
      issued_at: new Date().toISOString(),
      workload_class: "non_bundled" as const,
      subcommand: "batch_verify" as const,
      build_profile: "oss" as const,
      telemetry_source: "unknown" as const,
    };
    const req = productActivationPostRequest(body, { cliVersionSemver: cliSemver, includeCliHeaders: false });
    const res = await postProductActivation(req);
    expect(res.status).toBe(403);
  });

  it("400 when issued_at skew exceeds budget", async () => {
    const skewedIssued = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const body = {
      event: "verify_started" as const,
      schema_version: 2 as const,
      run_id: "run-reach-400-skew",
      issued_at: skewedIssued,
      workload_class: "non_bundled" as const,
      subcommand: "batch_verify" as const,
      build_profile: "oss" as const,
      telemetry_source: "unknown" as const,
    };
    const req = productActivationPostRequest(body, { cliVersionSemver: cliSemver });
    const res = await postProductActivation(req);
    expect(res.status).toBe(400);
  });

  it("204 and funnel_event row for valid v2 verify_started", async () => {
    const runId = "run-reach-204-success";
    const issued = new Date().toISOString();
    const body = {
      event: "verify_started" as const,
      schema_version: 2 as const,
      run_id: runId,
      issued_at: issued,
      workload_class: "non_bundled" as const,
      subcommand: "batch_verify" as const,
      build_profile: "oss" as const,
      telemetry_source: "unknown" as const,
    };
    const req = productActivationPostRequest(body, { cliVersionSemver: cliSemver });
    const res = await postProductActivation(req);
    expect(res.status).toBe(204);

    const rows = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_started"))
      .orderBy(desc(telemetryFunnelEvents.createdAt));
    expect(rows.some((r) => (r.metadata as { run_id?: string }).run_id === runId)).toBe(true);
  });
});
