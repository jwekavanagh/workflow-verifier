import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCorpusPatterns } from "./debugPatterns.js";
import type { CorpusRunLoadedOk, CorpusRunOutcome } from "./debugCorpus.js";
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
    const mkOk = (id: string): CorpusRunLoadedOk => ({
      loadStatus: "ok",
      runId: id,
      workflowResult: wr,
      meta: {},
      capturedAtEffectiveMs: 1,
      paths: { workflowResult: "", events: "" },
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
