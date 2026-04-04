import { describe, expect, it } from "vitest";
import { loadSchemaValidator } from "./schemaLoad.js";
import {
  buildAgentRunRecordForBundle,
  sha256Hex,
  type AgentRunRecord,
} from "./agentRunRecord.js";

describe("agentRunRecord", () => {
  it("sha256Hex matches known vector", () => {
    const b = Buffer.from("abc", "utf8");
    expect(sha256Hex(b)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("buildAgentRunRecordForBundle produces schema-valid record", () => {
    const wr = Buffer.from('{"schemaVersion":9,"workflowId":"w"}', "utf8");
    const ev = Buffer.from("{}\n", "utf8");
    const rec = buildAgentRunRecordForBundle({
      runId: "r1",
      workflowId: "w",
      producer: { name: "execution-truth-layer", version: "0.1.0" },
      verifiedAt: "2026-04-04T12:00:00.000Z",
      workflowResultBytes: wr,
      eventsBytes: ev,
    });
    const v = loadSchemaValidator("agent-run-record");
    expect(v(rec)).toBe(true);
    expect(rec.artifacts.workflowResult.relativePath).toBe("workflow-result.json");
    expect(rec.artifacts.events.relativePath).toBe("events.ndjson");
  });

  it("wrong relativePath fails schema validation", () => {
    const rec = {
      schemaVersion: 1,
      runId: "r",
      workflowId: "w",
      producer: { name: "n", version: "v" },
      verifiedAt: "2026-04-04T12:00:00.000Z",
      artifacts: {
        workflowResult: {
          relativePath: "wrong.json",
          sha256: "0".repeat(64),
          byteLength: 0,
        },
        events: {
          relativePath: "events.ndjson",
          sha256: "0".repeat(64),
          byteLength: 0,
        },
      },
    } as unknown as AgentRunRecord;
    const v = loadSchemaValidator("agent-run-record");
    expect(v(rec)).toBe(false);
  });
});
