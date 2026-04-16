import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../generated/commercialBuildFlags.js", () => ({
  LICENSE_PREFLIGHT_ENABLED: false,
}));

vi.mock("../ciLockWorkflow.js", async (importOriginal) => {
  const act = await importOriginal<typeof import("../ciLockWorkflow.js")>();
  return {
    ...act,
    parseBatchLockXorAndParsed: vi.fn(),
    executeBatchLockFromParsed: vi.fn(),
  };
});

import * as wf from "../ciLockWorkflow.js";
import * as activation from "../telemetry/postProductActivationEvent.js";
import * as beacon from "../commercial/postVerifyOutcomeBeacon.js";
import * as ossClaim from "../telemetry/maybeEmitOssClaimTicketUrl.js";
import { orchestrateVerifyBatchLockRun } from "./lockOrchestration.js";
import type { ParsedBatchVerifyCli } from "../cliArgv.js";
import type { WorkflowResult } from "../types.js";

const sampleParsed: ParsedBatchVerifyCli = {
  workflowId: "wf",
  eventsPath: "e.ndjson",
  registryPath: "r.json",
  database: { kind: "sqlite", path: "x.db" },
  verificationPolicy: { consistencyMode: "strong", verificationWindowMs: 0, pollIntervalMs: 0 },
  noTruthReport: true,
  shareReportOrigin: undefined,
  writeRunBundleDir: undefined,
  signPrivateKeyPath: undefined,
};

const sampleResult = {
  schemaVersion: 15 as const,
  workflowId: "wf",
  status: "complete" as const,
  steps: [],
} as unknown as WorkflowResult;

describe("lockOrchestration telemetry gates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.mocked(wf.parseBatchLockXorAndParsed).mockReturnValue({
      parsed: sampleParsed,
      lockKind: "output",
      lockPath: "/tmp/x.json",
    });
  });

  it("operational without verifiedResult → verify_started only (no verify_outcome)", async () => {
    vi.mocked(wf.executeBatchLockFromParsed).mockResolvedValue({
      tag: "operational",
      exitCode: 3,
      envelope: { code: "CLI_USAGE", message: "boom" },
    });
    const act = vi.spyOn(activation, "postProductActivationEvent").mockResolvedValue();
    const bc = vi.spyOn(beacon, "postVerifyOutcomeBeacon").mockResolvedValue();
    const claim = vi.spyOn(ossClaim, "maybeEmitOssClaimTicketUrlToStderr").mockResolvedValue();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    await expect(orchestrateVerifyBatchLockRun([])).rejects.toThrow("exit:3");

    const phases = act.mock.calls.map((c) => c[0].phase);
    expect(phases.filter((p) => p === "verify_started").length).toBe(1);
    expect(phases.includes("verify_outcome")).toBe(false);
    expect(bc).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("workflow_terminal → verify_started then verify_outcome before exit", async () => {
    vi.mocked(wf.executeBatchLockFromParsed).mockResolvedValue({
      tag: "workflow_terminal",
      exitCode: 0,
      result: sampleResult,
    });
    const act = vi.spyOn(activation, "postProductActivationEvent").mockResolvedValue();
    const bc = vi.spyOn(beacon, "postVerifyOutcomeBeacon").mockResolvedValue();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    await expect(orchestrateVerifyBatchLockRun([])).rejects.toThrow("exit:0");

    const phases = act.mock.calls.map((c) => c[0].phase);
    expect(phases.indexOf("verify_started")).toBeLessThan(phases.indexOf("verify_outcome"));
    expect(bc).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("operational with verifiedResult → verify_outcome emitted", async () => {
    vi.mocked(wf.executeBatchLockFromParsed).mockResolvedValue({
      tag: "operational",
      exitCode: 3,
      envelope: { code: "INTERNAL_ERROR", message: "after verify" },
      verifiedResult: sampleResult,
    });
    const act = vi.spyOn(activation, "postProductActivationEvent").mockResolvedValue();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    await expect(orchestrateVerifyBatchLockRun([])).rejects.toThrow("exit:3");

    expect(act.mock.calls.map((c) => c[0].phase).includes("verify_outcome")).toBe(true);
    exitSpy.mockRestore();
  });
});
