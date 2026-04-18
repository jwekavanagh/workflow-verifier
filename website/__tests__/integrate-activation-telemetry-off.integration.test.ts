import { INTEGRATE_ACTIVATION_SHELL_BODY } from "@/generated/integrateActivationShellStatic";
import { truncateCommercialFixtureDbs } from "./helpers/truncateCommercialFixture";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isValidator = process.env.ACTIVATION_SPINE_VALIDATOR === "1";
const hasCoreDb = Boolean(process.env.DATABASE_URL?.trim());
const hasTelemetryDb = Boolean(process.env.TELEMETRY_DATABASE_URL?.trim());
const hasBothDbs = hasCoreDb && hasTelemetryDb;

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

describe.skipIf(!isValidator && !hasBothDbs)("integrate activation telemetry off", () => {
  beforeEach(async () => {
    vi.stubEnv("AGENTSKEPTIC_TELEMETRY_WRITES_TELEMETRY_DB", "1");
    await truncateCommercialFixtureDbs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it(
    "postProductActivationEvent does not fetch when AGENTSKEPTIC_TELEMETRY=0; partner script exits 0; shell includes Step 3",
    { timeout: 120_000 },
    async () => {
    expect(INTEGRATE_ACTIVATION_SHELL_BODY).toContain("bootstrap");
    expect(INTEGRATE_ACTIVATION_SHELL_BODY).toContain("wf_bootstrap_fixture");
    expect(INTEGRATE_ACTIVATION_SHELL_BODY).toContain("wf_integrate_spine");
    expect(INTEGRATE_ACTIVATION_SHELL_BODY).toContain("examples/integrate-your-db/bootstrap-input.json");
    expect(INTEGRATE_ACTIVATION_SHELL_BODY).toContain("INTEGRATE_SPINE_GIT_URL");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    vi.stubEnv("AGENTSKEPTIC_TELEMETRY", "0");
    const modUrl = pathToFileURL(
      path.join(repoRoot, "dist", "telemetry", "postProductActivationEvent.js"),
    ).href;
    const { postProductActivationEvent } = await import(modUrl);
    await postProductActivationEvent({
      phase: "verify_started",
      run_id: "run-telemetry-off-spy-1",
      issued_at: new Date().toISOString(),
      workload_class: "non_bundled",
      workflow_lineage: "integrator_scoped",
      subcommand: "batch_verify",
      build_profile: "oss",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    const partnerEnv = { ...process.env, AGENTSKEPTIC_TELEMETRY: "0" };
    delete partnerEnv.PARTNER_POSTGRES_URL;
    partnerEnv.ACTIVATION_SPINE_VALIDATOR = process.env.ACTIVATION_SPINE_VALIDATOR ?? "";
    const r = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "partner-quickstart-verify.mjs")], {
      cwd: repoRoot,
      env: partnerEnv,
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    },
  );
});
