import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCorpusPatterns } from "./debugPatterns.js";
import type { CorpusRunLoadedOk, CorpusRunOutcome } from "./debugCorpus.js";
import type { AgentRunRecord } from "./agentRunRecord.js";
import { runListItemFromOutcome } from "./debugRunIndex.js";
import { normalizeToEmittedWorkflowResult } from "./workflowResultNormalize.js";
import type { WorkflowEngineResult, WorkflowResult } from "./types.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("buildCorpusPatterns", () => {
  it("returns CORPUS_TOO_LARGE when matched count exceeds maxMatched (test hook)", () => {
    const raw = JSON.parse(
      readFileSync(path.join(root, "examples", "debug-corpus", "run_ok", "workflow-result.json"), "utf8"),
    ) as WorkflowEngineResult | WorkflowResult;
    const wr = normalizeToEmittedWorkflowResult(raw);
    const dummyRecord = (id: string): AgentRunRecord => ({
      schemaVersion: 1,
      runId: id,
      workflowId: wr.workflowId,
      producer: { name: "workflow-verifier", version: "0.1.0" },
      verifiedAt: "2026-01-01T00:00:00.000Z",
      artifacts: {
        workflowResult: {
          relativePath: "workflow-result.json",
          sha256: "0".repeat(64),
          byteLength: 0,
        },
        events: { relativePath: "events.ndjson", sha256: "0".repeat(64), byteLength: 0 },
      },
    });
    const mkOk = (id: string): CorpusRunLoadedOk => ({
      loadStatus: "ok",
      runId: id,
      workflowResult: wr,
      meta: {},
      agentRunRecord: dummyRecord(id),
      capturedAtEffectiveMs: 1,
      paths: { workflowResult: "", events: "", agentRun: "" },
      malformedEventLineCount: 0,
    });
    const outcomes: CorpusRunOutcome[] = [mkOk("x1"), mkOk("x2"), mkOk("x3")];
    const rows = outcomes.map((o, i) => runListItemFromOutcome(o, i));
    const r = buildCorpusPatterns(outcomes, rows, { includeLoadErrors: true }, { maxMatched: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("CORPUS_TOO_LARGE");
      expect(r.status).toBe(413);
    }
  });
});
