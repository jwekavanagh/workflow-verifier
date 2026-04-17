import { POST as postProductActivation } from "@/app/api/funnel/product-activation/route";
import { POST as postSurface } from "@/app/api/funnel/surface-impression/route";
import { dbTelemetry } from "@/db/telemetryClient";
import { telemetryFunnelEvents } from "@/db/telemetrySchema";
import { truncateCommercialFixtureDbs } from "./helpers/truncateCommercialFixture";
import { getCanonicalSiteOrigin } from "@/lib/canonicalSiteOrigin";
import { getAcquisitionToIntegrateRolling7d } from "@/lib/growthMetricsAcquisitionToIntegrateRolling7d";
import { getCrossSurfaceConversionRolling7d } from "@/lib/growthMetricsCrossSurfaceConversionRolling7d";
import { getIntegrateToVerifyOutcomeRolling7d } from "@/lib/growthMetricsIntegrateToVerifyOutcomeRolling7d";
import { getTimeToFirstVerifyOutcomeSeconds } from "@/lib/growthMetricsTimeToFirstVerifyOutcome";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { productActivationPostRequest, surfaceImpressionPostRequest } from "./helpers/funnelApiRequests";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const hasTelemetryUrl = Boolean(process.env.TELEMETRY_DATABASE_URL?.trim());

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootPkgPath = join(__dirname, "..", "..", "package.json");
const cliSemver = JSON.parse(readFileSync(rootPkgPath, "utf8")).version as string;

describe.skipIf(!hasDatabaseUrl || !hasTelemetryUrl)("growth cross-surface metrics", () => {
  beforeEach(async () => {
    vi.stubEnv("AGENTSKEPTIC_TELEMETRY_WRITES_TELEMETRY_DB", "1");
    await truncateCommercialFixtureDbs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("joins acquisition_landed to verify_outcome on same funnel_anon_id with ordered timestamps", async () => {
    const canonical = getCanonicalSiteOrigin();
    const fid = "b5c0ee2f-4f1a-4c1a-8a1a-111111111111";
    const sRes = await postSurface(
      surfaceImpressionPostRequest(
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
    const pRes = await postProductActivation(
      productActivationPostRequest(outBody, { cliVersionSemver: cliSemver }),
    );
    expect(pRes.status).toBe(204);

    const acq = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "acquisition_landed"));
    const out = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_outcome"));
    expect(acq).toHaveLength(1);
    expect(out).toHaveLength(1);
    expect((acq[0]!.metadata as { funnel_anon_id?: string }).funnel_anon_id).toBe(fid);
    expect((out[0]!.metadata as { funnel_anon_id?: string }).funnel_anon_id).toBe(fid);
    expect(acq[0]!.createdAt.getTime()).toBeLessThanOrEqual(out[0]!.createdAt.getTime());
  });

  it("TimeToFirstVerifyOutcome_Seconds returns 42 for seeded timestamps", async () => {
    const fid = "c6d1ff30-5a2b-4d2b-8b2b-222222222222";
    const base = Date.now();
    await dbTelemetry.insert(telemetryFunnelEvents).values([
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
        serverVercelEnv: "unset",
        serverNodeEnv: "test",
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
        serverVercelEnv: "unset",
        serverNodeEnv: "test",
      },
    ]);
    const sec = await getTimeToFirstVerifyOutcomeSeconds(fid);
    expect(sec).toBe(42);
  });

  it("CrossSurface_ConversionRate rolling 7d returns D=2 N=1 rate 0.5", async () => {
    const fa = "d7e2aa41-6b3c-4e3c-ac3c-333333333333";
    const fb = "e8f3bb52-7c4d-4f4d-bd4d-444444444444";
    const now = new Date();
    await dbTelemetry.insert(telemetryFunnelEvents).values([
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
        serverVercelEnv: "unset",
        serverNodeEnv: "test",
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
        serverVercelEnv: "unset",
        serverNodeEnv: "test",
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
        serverVercelEnv: "unset",
        serverNodeEnv: "test",
      },
    ]);
    const r = await getCrossSurfaceConversionRolling7d();
    expect(r.d).toBe(2);
    expect(r.n).toBe(1);
    expect(r.rate).toBeCloseTo(0.5, 5);
  });

  const dayMs = 24 * 60 * 60 * 1000;
  const telemetryRowDefaults = {
    serverVercelEnv: "unset" as const,
    serverNodeEnv: "test" as const,
  };

  describe("CrossSurface_ConversionRate_AcquisitionToIntegrate_Rolling7dUtc contract", () => {
    it("Happy path: one acquisition and one integrate same id in window → d=1 n=1 rate=1", async () => {
      const fid = "f1a00001-0001-4001-8001-000000000001";
      const now = new Date();
      await dbTelemetry.insert(telemetryFunnelEvents).values([
        {
          event: "acquisition_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "acquisition",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
      ]);
      const r = await getAcquisitionToIntegrateRolling7d();
      expect(r.d).toBe(1);
      expect(r.n).toBe(1);
      expect(r.rate).toBe(1);
    });

    it("Duplicate events: three acquisition and two integrate same id → d=1 n=1 rate=1", async () => {
      const fid = "f1a00002-0001-4001-8001-000000000002";
      const now = new Date();
      await dbTelemetry.insert(telemetryFunnelEvents).values([
        {
          event: "acquisition_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "acquisition",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "acquisition_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "acquisition",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "acquisition_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "acquisition",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
      ]);
      const r = await getAcquisitionToIntegrateRolling7d();
      expect(r.d).toBe(1);
      expect(r.n).toBe(1);
      expect(r.rate).toBe(1);
    });

    it("Out-of-window: stale acquisition must not inflate d", async () => {
      const fid = "f1a00003-0001-4001-8001-000000000003";
      const now = new Date();
      const stale = new Date(now.getTime() - 8 * dayMs);
      await dbTelemetry.insert(telemetryFunnelEvents).values([
        {
          event: "acquisition_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "acquisition",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: stale,
          ...telemetryRowDefaults,
        },
        {
          event: "acquisition_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "acquisition",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
      ]);
      const r = await getAcquisitionToIntegrateRolling7d();
      expect(r.d).toBe(1);
      expect(r.n).toBe(1);
      expect(r.rate).toBe(1);
    });

    it("Null or empty funnel_anon_id noise must not add a second distinct id to d", async () => {
      const fid = "f1a00004-0001-4001-8001-000000000004";
      const now = new Date();
      await dbTelemetry.insert(telemetryFunnelEvents).values([
        {
          event: "acquisition_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "acquisition",
            funnel_anon_id: "",
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "acquisition_landed",
          userId: null,
          metadata: { schema_version: 1, surface: "acquisition", attribution: {} },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "acquisition_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "acquisition",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
      ]);
      const r = await getAcquisitionToIntegrateRolling7d();
      expect(r.d).toBe(1);
      expect(r.n).toBe(1);
      expect(r.rate).toBe(1);
    });

    it("Integrate without acquisition: id not in acquisition→integrate d", async () => {
      const fid = "f1a00005-0001-4001-8001-000000000005";
      const now = new Date();
      await dbTelemetry.insert(telemetryFunnelEvents).values([
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
      ]);
      const r = await getAcquisitionToIntegrateRolling7d();
      expect(r.d).toBe(0);
      expect(r.n).toBe(0);
      expect(r.rate).toBeNull();
    });

    it("Acquisition without integrate: d=1 n=0 rate=0", async () => {
      const fid = "f1a00006-0001-4001-8001-000000000006";
      const now = new Date();
      await dbTelemetry.insert(telemetryFunnelEvents).values([
        {
          event: "acquisition_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "acquisition",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
      ]);
      const r = await getAcquisitionToIntegrateRolling7d();
      expect(r.d).toBe(1);
      expect(r.n).toBe(0);
      expect(r.rate).toBe(0);
    });
  });

  describe("CrossSurface_ConversionRate_IntegrateToVerifyOutcome_Rolling7dUtc contract", () => {
    it("Happy path: integrate and qualifying verify_outcome same id → d=1 n=1 rate=1", async () => {
      const fid = "f2b00001-0002-4002-8002-000000000001";
      const now = new Date();
      await dbTelemetry.insert(telemetryFunnelEvents).values([
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "verify_outcome",
          userId: null,
          metadata: {
            schema_version: 1,
            run_id: "r-io-1",
            issued_at: now.toISOString(),
            workload_class: "non_bundled",
            subcommand: "batch_verify",
            build_profile: "oss",
            terminal_status: "complete",
            funnel_anon_id: fid,
            telemetry_source: "unknown",
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
      ]);
      const r = await getIntegrateToVerifyOutcomeRolling7d();
      expect(r.d).toBe(1);
      expect(r.n).toBe(1);
      expect(r.rate).toBe(1);
    });

    it("Duplicate events: multiple integrate and outcome same id → d=1 n=1 rate=1", async () => {
      const fid = "f2b00002-0002-4002-8002-000000000002";
      const now = new Date();
      await dbTelemetry.insert(telemetryFunnelEvents).values([
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "verify_outcome",
          userId: null,
          metadata: {
            schema_version: 1,
            run_id: "r-io-2a",
            issued_at: now.toISOString(),
            workload_class: "non_bundled",
            subcommand: "batch_verify",
            build_profile: "oss",
            terminal_status: "complete",
            funnel_anon_id: fid,
            telemetry_source: "unknown",
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "verify_outcome",
          userId: null,
          metadata: {
            schema_version: 1,
            run_id: "r-io-2b",
            issued_at: now.toISOString(),
            workload_class: "non_bundled",
            subcommand: "batch_verify",
            build_profile: "oss",
            terminal_status: "complete",
            funnel_anon_id: fid,
            telemetry_source: "unknown",
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
      ]);
      const r = await getIntegrateToVerifyOutcomeRolling7d();
      expect(r.d).toBe(1);
      expect(r.n).toBe(1);
      expect(r.rate).toBe(1);
    });

    it("Out-of-window: integrate in-window and outcome older than 7d → d=1 n=0", async () => {
      const fid = "f2b00003-0002-4002-8002-000000000003";
      const now = new Date();
      const staleOutcome = new Date(now.getTime() - 8 * dayMs);
      await dbTelemetry.insert(telemetryFunnelEvents).values([
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "verify_outcome",
          userId: null,
          metadata: {
            schema_version: 1,
            run_id: "r-io-3",
            issued_at: staleOutcome.toISOString(),
            workload_class: "non_bundled",
            subcommand: "batch_verify",
            build_profile: "oss",
            terminal_status: "complete",
            funnel_anon_id: fid,
            telemetry_source: "unknown",
          },
          createdAt: staleOutcome,
          ...telemetryRowDefaults,
        },
      ]);
      const r = await getIntegrateToVerifyOutcomeRolling7d();
      expect(r.d).toBe(1);
      expect(r.n).toBe(0);
      expect(r.rate).toBe(0);
    });

    it("Null or empty funnel_anon_id on integrate must not add a second distinct id to d", async () => {
      const fid = "f2b00004-0002-4002-8002-000000000004";
      const now = new Date();
      await dbTelemetry.insert(telemetryFunnelEvents).values([
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: "",
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "integrate_landed",
          userId: null,
          metadata: { schema_version: 1, surface: "integrate", attribution: {} },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "verify_outcome",
          userId: null,
          metadata: {
            schema_version: 1,
            run_id: "r-io-4",
            issued_at: now.toISOString(),
            workload_class: "non_bundled",
            subcommand: "batch_verify",
            build_profile: "oss",
            terminal_status: "complete",
            funnel_anon_id: fid,
            telemetry_source: "unknown",
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
      ]);
      const r = await getIntegrateToVerifyOutcomeRolling7d();
      expect(r.d).toBe(1);
      expect(r.n).toBe(1);
      expect(r.rate).toBe(1);
    });

    it("local_dev verify_outcome must not count as qualifying outcome", async () => {
      const fid = "f2b00005-0002-4002-8002-000000000005";
      const now = new Date();
      await dbTelemetry.insert(telemetryFunnelEvents).values([
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "verify_outcome",
          userId: null,
          metadata: {
            schema_version: 1,
            run_id: "r-io-5",
            issued_at: now.toISOString(),
            workload_class: "non_bundled",
            subcommand: "batch_verify",
            build_profile: "oss",
            terminal_status: "complete",
            funnel_anon_id: fid,
            telemetry_source: "local_dev",
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
      ]);
      const r = await getIntegrateToVerifyOutcomeRolling7d();
      expect(r.d).toBe(1);
      expect(r.n).toBe(0);
      expect(r.rate).toBe(0);
    });

    it("verify_outcome without matching integrate_landed yields d=0 n=0", async () => {
      const fid = "f2b00006-0002-4002-8002-000000000006";
      const now = new Date();
      await dbTelemetry.insert(telemetryFunnelEvents).values([
        {
          event: "verify_outcome",
          userId: null,
          metadata: {
            schema_version: 1,
            run_id: "r-io-6",
            issued_at: now.toISOString(),
            workload_class: "non_bundled",
            subcommand: "batch_verify",
            build_profile: "oss",
            terminal_status: "complete",
            funnel_anon_id: fid,
            telemetry_source: "unknown",
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
      ]);
      const r = await getIntegrateToVerifyOutcomeRolling7d();
      expect(r.d).toBe(0);
      expect(r.n).toBe(0);
      expect(r.rate).toBeNull();
    });

    it("Integrate-only cohort: I→O rate 1 while compressed acquisition→outcome has d=0", async () => {
      const fid = "f2b00007-0002-4002-8002-000000000007";
      const now = new Date();
      await dbTelemetry.insert(telemetryFunnelEvents).values([
        {
          event: "integrate_landed",
          userId: null,
          metadata: {
            schema_version: 1,
            surface: "integrate",
            funnel_anon_id: fid,
            attribution: {},
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
        {
          event: "verify_outcome",
          userId: null,
          metadata: {
            schema_version: 1,
            run_id: "r-io-7",
            issued_at: now.toISOString(),
            workload_class: "non_bundled",
            subcommand: "batch_verify",
            build_profile: "oss",
            terminal_status: "complete",
            funnel_anon_id: fid,
            telemetry_source: "unknown",
          },
          createdAt: now,
          ...telemetryRowDefaults,
        },
      ]);
      const io = await getIntegrateToVerifyOutcomeRolling7d();
      expect(io.d).toBe(1);
      expect(io.n).toBe(1);
      expect(io.rate).toBe(1);
      const compressed = await getCrossSurfaceConversionRolling7d();
      expect(compressed.d).toBe(0);
      expect(compressed.n).toBe(0);
      expect(compressed.rate).toBeNull();
    });
  });
});
