import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postProductActivationEvent } from "./postProductActivationEvent.js";

describe("postProductActivationEvent", () => {
  beforeEach(() => {
    delete process.env.AGENTSKEPTIC_TELEMETRY;
    delete process.env.AGENTSKEPTIC_TELEMETRY_ORIGIN;
    delete process.env.AGENTSKEPTIC_TELEMETRY_SOURCE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not call fetch when AGENTSKEPTIC_TELEMETRY=0", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.AGENTSKEPTIC_TELEMETRY = "0";
    await postProductActivationEvent({
      phase: "verify_started",
      run_id: "r1",
      issued_at: new Date().toISOString(),
      workload_class: "non_bundled",
      subcommand: "batch_verify",
      build_profile: "oss",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs verify_started with CLI headers and does not throw on fetch failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    await postProductActivationEvent({
      phase: "verify_started",
      run_id: "r2",
      issued_at: new Date().toISOString(),
      workload_class: "bundled_examples",
      subcommand: "quick_verify",
      build_profile: "oss",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init).toMatchObject({ method: "POST" });
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["X-AgentSkeptic-Product"]).toBe("cli");
    expect(headers["X-AgentSkeptic-Cli-Version"]).toMatch(/^\d+\.\d+\.\d+/);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.schema_version).toBe(2);
    expect(body.telemetry_source).toBe("unknown");
  });

  it("POSTs telemetry_source local_dev when AGENTSKEPTIC_TELEMETRY_SOURCE=local_dev", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);
    process.env.AGENTSKEPTIC_TELEMETRY_SOURCE = "local_dev";
    await postProductActivationEvent({
      phase: "verify_started",
      run_id: "r-local",
      issued_at: new Date().toISOString(),
      workload_class: "non_bundled",
      subcommand: "batch_verify",
      build_profile: "oss",
    });
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.telemetry_source).toBe("local_dev");
  });
});
