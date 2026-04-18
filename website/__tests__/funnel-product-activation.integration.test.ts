import { POST as postProductActivation } from "@/app/api/funnel/product-activation/route";
import { db } from "@/db/client";
import { dbTelemetry } from "@/db/telemetryClient";
import { funnelEvents } from "@/db/schema";
import {
  telemetryFunnelEvents,
  telemetryProductActivationOutcomeBeacons,
  telemetryProductActivationStartedBeacons,
} from "@/db/telemetrySchema";
import { truncateCommercialFixtureDbs } from "./helpers/truncateCommercialFixture";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { productActivationPostRequest } from "./helpers/funnelApiRequests";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const hasTelemetryUrl = Boolean(process.env.TELEMETRY_DATABASE_URL?.trim());

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootPkgPath = join(__dirname, "..", "..", "package.json");
const cliSemver = JSON.parse(readFileSync(rootPkgPath, "utf8")).version as string;

describe.skipIf(!hasDatabaseUrl || !hasTelemetryUrl)("funnel product-activation", () => {
  beforeEach(async () => {
    vi.stubEnv("AGENTSKEPTIC_TELEMETRY_WRITES_TELEMETRY_DB", "1");
    await truncateCommercialFixtureDbs();
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
    const req1 = productActivationPostRequest(startedBody, { cliVersionSemver: cliSemver });
    const res1 = await postProductActivation(req1);
    expect(res1.status).toBe(204);
    const rows1 = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_started"));
    expect(rows1).toHaveLength(1);
    const coreRows = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "verify_started"));
    expect(coreRows).toHaveLength(0);
    expect((rows1[0]!.metadata as { telemetry_source?: string }).telemetry_source).toBe(
      "legacy_unattributed",
    );
    const beacons1 = await dbTelemetry.select().from(telemetryProductActivationStartedBeacons);
    expect(beacons1).toHaveLength(1);

    const req2 = productActivationPostRequest(startedBody, { cliVersionSemver: cliSemver });
    const res2 = await postProductActivation(req2);
    expect(res2.status).toBe(204);
    const rows2 = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_started"));
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
    expect((await postProductActivation(productActivationPostRequest(body, { cliVersionSemver: cliSemver }))).status).toBe(204);
    expect((await postProductActivation(productActivationPostRequest(body, { cliVersionSemver: cliSemver }))).status).toBe(204);
    const rows = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_outcome"));
    expect(rows).toHaveLength(1);
    const beacons = await dbTelemetry.select().from(telemetryProductActivationOutcomeBeacons);
    expect(beacons).toHaveLength(1);
  });

  it("returns 400 when issued_at skew is too large", async () => {
    const old = new Date(Date.now() - 400_000).toISOString();
    const res = await postProductActivation(
      productActivationPostRequest(
        {
          ...startedBody,
          issued_at: old,
        },
        { cliVersionSemver: cliSemver },
      ),
    );
    expect(res.status).toBe(400);
    const rows = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_started"));
    expect(rows).toHaveLength(0);
  });

  it("returns 403 without valid CLI headers", async () => {
    const res = await postProductActivation(
      productActivationPostRequest(startedBody, {
        cliVersionSemver: cliSemver,
        includeCliHeaders: false,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when funnel_anon_id is not a valid UUIDv4", async () => {
    const res = await postProductActivation(
      productActivationPostRequest(
        {
          ...startedBody,
          funnel_anon_id: "not-a-uuid",
        },
        { cliVersionSemver: cliSemver },
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns 204 and persists funnel_anon_id in metadata when valid", async () => {
    const fid = "a0000000-0000-4000-8000-000000000099";
    const res = await postProductActivation(
      productActivationPostRequest(
        {
          ...startedBody,
          run_id: "run-with-fid",
          funnel_anon_id: fid,
        },
        { cliVersionSemver: cliSemver },
      ),
    );
    expect(res.status).toBe(204);
    const rows = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_started"));
    expect((rows[0]!.metadata as { funnel_anon_id?: string }).funnel_anon_id).toBe(fid);
  });

  it("returns 204 with install_id null when install_id is omitted (old CLI)", async () => {
    const res = await postProductActivation(
      productActivationPostRequest(startedBody, { cliVersionSemver: cliSemver }),
    );
    expect(res.status).toBe(204);
    const rows = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_started"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.installId).toBeNull();
  });

  it("returns 400 when install_id is not a valid UUID", async () => {
    const res = await postProductActivation(
      productActivationPostRequest(
        {
          ...startedBody,
          run_id: "run-bad-install-id",
          install_id: "not-a-uuid",
        },
        { cliVersionSemver: cliSemver },
      ),
    );
    expect(res.status).toBe(400);
    const rows = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_started"));
    expect(rows).toHaveLength(0);
  });

  it("persists same install_id on verify_started and verify_outcome for one run", async () => {
    const iid = "b0000000-0000-4000-8000-000000000088";
    const rid = "run-install-column-1";
    const issued = new Date().toISOString();
    expect(
      (
        await postProductActivation(
          productActivationPostRequest(
            {
              ...startedBody,
              run_id: rid,
              install_id: iid,
            },
            { cliVersionSemver: cliSemver },
          ),
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await postProductActivation(
          productActivationPostRequest(
            {
              event: "verify_outcome" as const,
              schema_version: 1 as const,
              run_id: rid,
              issued_at: issued,
              workload_class: "non_bundled" as const,
              subcommand: "batch_verify" as const,
              build_profile: "oss" as const,
              terminal_status: "complete" as const,
              install_id: iid,
            },
            { cliVersionSemver: cliSemver },
          ),
        )
      ).status,
    ).toBe(204);
    const started = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_started"));
    const outcomes = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_outcome"));
    expect(started[0]!.installId).toBe(iid);
    expect(outcomes[0]!.installId).toBe(iid);
  });

  it("returns 204 for v2 verify_started and persists telemetry_source", async () => {
    const body = {
      event: "verify_started" as const,
      schema_version: 2 as const,
      run_id: "run-v2-started",
      issued_at: issuedNow,
      workload_class: "non_bundled" as const,
      subcommand: "batch_verify" as const,
      build_profile: "oss" as const,
      telemetry_source: "local_dev" as const,
    };
    expect((await postProductActivation(productActivationPostRequest(body, { cliVersionSemver: cliSemver }))).status).toBe(204);
    const rows = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_started"));
    expect((rows[0]!.metadata as { telemetry_source?: string }).telemetry_source).toBe("local_dev");
  });

  it("returns 400 for invalid v2 telemetry_source", async () => {
    const res = await postProductActivation(
      productActivationPostRequest(
        {
          event: "verify_started",
          schema_version: 2,
          run_id: "run-bad-ts",
          issued_at: issuedNow,
          workload_class: "non_bundled",
          subcommand: "batch_verify",
          build_profile: "oss",
          telemetry_source: "legacy_unattributed",
        },
        { cliVersionSemver: cliSemver },
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns 413 when Content-Length exceeds cap", async () => {
    const res = await postProductActivation(
      productActivationPostRequest(startedBody, {
        cliVersionSemver: cliSemver,
        extraHeaders: { "content-length": "999999" },
      }),
    );
    expect(res.status).toBe(413);
  });

  it("returns 204 for v2 verify_started without verification_hypothesis; metadata omits key (#1)", async () => {
    const body = {
      event: "verify_started" as const,
      schema_version: 2 as const,
      run_id: "run-v2-no-hyp-started",
      issued_at: issuedNow,
      workload_class: "non_bundled" as const,
      subcommand: "batch_verify" as const,
      build_profile: "oss" as const,
      telemetry_source: "unknown" as const,
    };
    expect((await postProductActivation(productActivationPostRequest(body, { cliVersionSemver: cliSemver }))).status).toBe(
      204,
    );
    const rows = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_started"));
    const hit = rows.find((r) => (r.metadata as { run_id?: string }).run_id === body.run_id);
    expect(hit).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(hit!.metadata, "verification_hypothesis")).toBe(false);
  });

  it("returns 204 for v2 with valid verification_hypothesis; metadata stores trimmed value (#5)", async () => {
    const hyp = "  Expect_row_for_partner_1  ";
    const body = {
      event: "verify_started" as const,
      schema_version: 2 as const,
      run_id: "run-v2-hyp-started",
      issued_at: issuedNow,
      workload_class: "non_bundled" as const,
      subcommand: "batch_verify" as const,
      build_profile: "oss" as const,
      telemetry_source: "unknown" as const,
      verification_hypothesis: hyp,
    };
    expect((await postProductActivation(productActivationPostRequest(body, { cliVersionSemver: cliSemver }))).status).toBe(
      204,
    );
    const rows = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_started"));
    const hit = rows.find((r) => (r.metadata as { run_id?: string }).run_id === body.run_id);
    expect(hit).toBeDefined();
    expect((hit!.metadata as { verification_hypothesis?: string }).verification_hypothesis).toBe(
      "Expect_row_for_partner_1",
    );
  });

  it("returns 400 for v2 with invalid verification_hypothesis charset (#7)", async () => {
    const body = {
      event: "verify_started" as const,
      schema_version: 2 as const,
      run_id: "run-v2-bad-hyp",
      issued_at: issuedNow,
      workload_class: "non_bundled" as const,
      subcommand: "batch_verify" as const,
      build_profile: "oss" as const,
      telemetry_source: "unknown" as const,
      verification_hypothesis: `bad"hyp`,
    };
    const res = await postProductActivation(productActivationPostRequest(body, { cliVersionSemver: cliSemver }));
    expect(res.status).toBe(400);
    const rows = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_started"));
    expect(rows.some((r) => (r.metadata as { run_id?: string }).run_id === body.run_id)).toBe(false);
  });

  it("returns 400 for v2 with empty verification_hypothesis string (#7)", async () => {
    const body = {
      event: "verify_started" as const,
      schema_version: 2 as const,
      run_id: "run-v2-empty-hyp",
      issued_at: issuedNow,
      workload_class: "non_bundled" as const,
      subcommand: "batch_verify" as const,
      build_profile: "oss" as const,
      telemetry_source: "unknown" as const,
      verification_hypothesis: "",
    };
    expect((await postProductActivation(productActivationPostRequest(body, { cliVersionSemver: cliSemver }))).status).toBe(
      400,
    );
  });

  it("returns 204 for v2 verify_outcome with verification_hypothesis; metadata stores value (#6)", async () => {
    const rid = "run-v2-hyp-outcome";
    const issued = new Date().toISOString();
    const hyp = "Expect_complete_status";
    const started = {
      event: "verify_started" as const,
      schema_version: 2 as const,
      run_id: rid,
      issued_at: issued,
      workload_class: "non_bundled" as const,
      subcommand: "batch_verify" as const,
      build_profile: "oss" as const,
      telemetry_source: "unknown" as const,
      verification_hypothesis: hyp,
    };
    expect((await postProductActivation(productActivationPostRequest(started, { cliVersionSemver: cliSemver }))).status).toBe(
      204,
    );
    const outcome = {
      event: "verify_outcome" as const,
      schema_version: 2 as const,
      run_id: rid,
      issued_at: issued,
      workload_class: "non_bundled" as const,
      subcommand: "batch_verify" as const,
      build_profile: "oss" as const,
      terminal_status: "complete" as const,
      telemetry_source: "unknown" as const,
      verification_hypothesis: hyp,
    };
    expect((await postProductActivation(productActivationPostRequest(outcome, { cliVersionSemver: cliSemver }))).status).toBe(
      204,
    );
    const rows = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_outcome"));
    const hit = rows.find((r) => (r.metadata as { run_id?: string }).run_id === rid);
    expect((hit!.metadata as { verification_hypothesis?: string }).verification_hypothesis).toBe(hyp);
  });

  it("returns 204 for v3 verify_started and persists workflow_lineage in metadata", async () => {
    const body = {
      event: "verify_started" as const,
      schema_version: 3 as const,
      run_id: "run-v3-lineage-started",
      issued_at: issuedNow,
      workload_class: "non_bundled" as const,
      workflow_lineage: "integrator_scoped" as const,
      subcommand: "batch_verify" as const,
      build_profile: "oss" as const,
      telemetry_source: "unknown" as const,
    };
    expect((await postProductActivation(productActivationPostRequest(body, { cliVersionSemver: cliSemver }))).status).toBe(
      204,
    );
    const rows = await dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, "verify_started"));
    const hit = rows.find((r) => (r.metadata as { run_id?: string }).run_id === body.run_id);
    expect((hit!.metadata as { workflow_lineage?: string }).workflow_lineage).toBe("integrator_scoped");
  });

  it("returns 400 for v3 with invalid workflow_lineage", async () => {
    const body = {
      event: "verify_started",
      schema_version: 3,
      run_id: "run-v3-bad-lineage",
      issued_at: issuedNow,
      workload_class: "non_bundled",
      workflow_lineage: "not_an_enum",
      subcommand: "batch_verify",
      build_profile: "oss",
      telemetry_source: "unknown",
    };
    const res = await postProductActivation(productActivationPostRequest(body, { cliVersionSemver: cliSemver }));
    expect(res.status).toBe(400);
  });
});
