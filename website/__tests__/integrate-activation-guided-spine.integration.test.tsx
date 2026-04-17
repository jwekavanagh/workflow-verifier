// @vitest-environment jsdom

import { POST as postProductActivation } from "@/app/api/funnel/product-activation/route";
import { POST as postSurface } from "@/app/api/funnel/surface-impression/route";
import { IntegrateActivationBlock } from "@/components/IntegrateActivationBlock";
import { dbTelemetry } from "@/db/telemetryClient";
import { telemetryFunnelEvents } from "@/db/telemetrySchema";
import { truncateCommercialFixtureDbs } from "./helpers/truncateCommercialFixture";
import { INTEGRATE_ACTIVATION_SHELL_BODY } from "@/generated/integrateActivationShellStatic";
import { getCanonicalSiteOrigin } from "@/lib/canonicalSiteOrigin";
import {
  PRODUCT_ACTIVATION_CLI_PRODUCT_HEADER,
  PRODUCT_ACTIVATION_CLI_VERSION_HEADER,
} from "@/lib/funnelProductActivationConstants";
import { getIntegrateToVerifyOutcomeRolling7d } from "@/lib/growthMetricsIntegrateToVerifyOutcomeRolling7d";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isValidator = process.env.ACTIVATION_SPINE_VALIDATOR === "1";
const hasCoreDb = Boolean(process.env.DATABASE_URL?.trim());
const hasTelemetryDb = Boolean(process.env.TELEMETRY_DATABASE_URL?.trim());
const hasBothDbs = hasCoreDb && hasTelemetryDb;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

describe.skipIf(!isValidator && !hasBothDbs)("integrate activation guided spine", () => {
  beforeEach(async () => {
    vi.stubEnv("AGENTSKEPTIC_TELEMETRY_WRITES_TELEMETRY_DB", "1");
    await truncateCommercialFixtureDbs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
  });

  it(
    "RTL shell + join key, surface + product-activation, North Star rolling 7d",
    { timeout: 180_000 },
    async () => {
      const F = "a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab";
      const installId = "b2c3d4e5-f6a7-4b8c-9d0e-123456789abc";
      const issued = new Date().toISOString();

      window.localStorage.setItem("agentskeptic_funnel_anon_id", F);
      render(<IntegrateActivationBlock />);
      await waitFor(() => {
        const block = screen.getByTestId("integrate-activation-block");
        expect(block.textContent).toContain(`export AGENTSKEPTIC_FUNNEL_ANON_ID=${F}`);
        expect(block.textContent).toContain(INTEGRATE_ACTIVATION_SHELL_BODY.trim().slice(0, 30));
      });

      const canonical = getCanonicalSiteOrigin();
      const sRes = await postSurface(
        surfaceReq(
          {
            surface: "integrate",
            funnel_anon_id: F,
            attribution: { landing_path: "/integrate" },
          },
          canonical,
        ),
      );
      expect(sRes.status).toBe(200);

      const startedBody = {
        event: "verify_started" as const,
        schema_version: 2 as const,
        run_id: "run-spine-started-1",
        issued_at: issued,
        workload_class: "non_bundled" as const,
        subcommand: "batch_verify" as const,
        build_profile: "oss" as const,
        telemetry_source: "unknown" as const,
        funnel_anon_id: F,
        install_id: installId,
      };
      const outcomeBody = {
        event: "verify_outcome" as const,
        schema_version: 2 as const,
        run_id: "run-spine-outcome-1",
        issued_at: issued,
        workload_class: "non_bundled" as const,
        subcommand: "batch_verify" as const,
        build_profile: "oss" as const,
        terminal_status: "complete" as const,
        telemetry_source: "unknown" as const,
        funnel_anon_id: F,
        install_id: installId,
      };

      expect((await postProductActivation(activationReq(startedBody))).status).toBe(204);
      expect((await postProductActivation(activationReq(outcomeBody))).status).toBe(204);

      const landed = await dbTelemetry
        .select()
        .from(telemetryFunnelEvents)
        .where(eq(telemetryFunnelEvents.event, "integrate_landed"));
      expect(landed.length).toBeGreaterThanOrEqual(1);
      expect(
        landed.some((r) => (r.metadata as { funnel_anon_id?: string }).funnel_anon_id === F),
      ).toBe(true);

      const outcomes = await dbTelemetry
        .select()
        .from(telemetryFunnelEvents)
        .where(eq(telemetryFunnelEvents.event, "verify_outcome"));
      expect(outcomes.some((r) => (r.metadata as { funnel_anon_id?: string }).funnel_anon_id === F)).toBe(
        true,
      );

      const kpi = await getIntegrateToVerifyOutcomeRolling7d();
      expect(kpi.d).toBe(1);
      expect(kpi.n).toBe(1);
      expect(kpi.rate).toBe(1);
    },
  );
});
