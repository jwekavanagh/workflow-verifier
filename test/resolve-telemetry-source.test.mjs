import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

describe("resolveTelemetrySource", () => {
  let prev;

  beforeEach(() => {
    prev = process.env.AGENTSKEPTIC_TELEMETRY_SOURCE;
    delete process.env.AGENTSKEPTIC_TELEMETRY_SOURCE;
  });

  afterEach(() => {
    if (prev !== undefined) process.env.AGENTSKEPTIC_TELEMETRY_SOURCE = prev;
    else delete process.env.AGENTSKEPTIC_TELEMETRY_SOURCE;
  });

  it("returns unknown when AGENTSKEPTIC_TELEMETRY_SOURCE is unset", async () => {
    const { resolveTelemetrySource } = await import("../dist/telemetry/resolveTelemetrySource.js");
    assert.equal(resolveTelemetrySource(), "unknown");
  });

  it("returns local_dev when AGENTSKEPTIC_TELEMETRY_SOURCE is local_dev", async () => {
    const { resolveTelemetrySource } = await import("../dist/telemetry/resolveTelemetrySource.js");
    process.env.AGENTSKEPTIC_TELEMETRY_SOURCE = "local_dev";
    assert.equal(resolveTelemetrySource(), "local_dev");
  });

  it("returns unknown for other TELEMETRY_SOURCE values", async () => {
    const { resolveTelemetrySource } = await import("../dist/telemetry/resolveTelemetrySource.js");
    process.env.AGENTSKEPTIC_TELEMETRY_SOURCE = "ci";
    assert.equal(resolveTelemetrySource(), "unknown");
  });
});
