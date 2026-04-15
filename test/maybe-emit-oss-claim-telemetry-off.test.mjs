/**
 * TELEMETRY=0: claim stderr helper exits before randomBytes/fetch (requires `npm run build`).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

describe("maybeEmitOssClaimTicketUrlToStderr telemetry off", () => {
  let prevTelemetry;
  let prevStderr;
  let prevFetch;
  /** @type {unknown[]} */
  let stderrLines;
  /** @type {unknown[]} */
  let fetchCalls;

  beforeEach(() => {
    prevTelemetry = process.env.AGENTSKEPTIC_TELEMETRY;
    prevStderr = console.error;
    prevFetch = globalThis.fetch;
    stderrLines = [];
    fetchCalls = [];
    console.error = (...args) => {
      stderrLines.push(args);
    };
    globalThis.fetch = async () => {
      fetchCalls.push(true);
      return { ok: true, status: 204 };
    };
    process.env.AGENTSKEPTIC_TELEMETRY = "0";
  });

  afterEach(() => {
    console.error = prevStderr;
    globalThis.fetch = prevFetch;
    if (prevTelemetry !== undefined) process.env.AGENTSKEPTIC_TELEMETRY = prevTelemetry;
    else delete process.env.AGENTSKEPTIC_TELEMETRY;
  });

  it("no fetch and no agentskeptic stderr when AGENTSKEPTIC_TELEMETRY=0", async () => {
    const { maybeEmitOssClaimTicketUrlToStderr } = await import(
      "../dist/telemetry/maybeEmitOssClaimTicketUrl.js"
    );
    await maybeEmitOssClaimTicketUrlToStderr({
      run_id: "run-telemetry-off",
      terminal_status: "complete",
      workload_class: "non_bundled",
      subcommand: "quick_verify",
      build_profile: "oss",
    });
    assert.equal(fetchCalls.length, 0);
    const claimHint = stderrLines.some(
      (args) =>
        Array.isArray(args) &&
        args.some((a) => typeof a === "string" && a.includes("Link this verification run")),
    );
    assert.equal(claimHint, false);
  });
});
