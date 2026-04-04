import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildExecutionTraceView } from "./executionTrace.js";
import { loadEventsForWorkflow } from "./loadEvents.js";
import { buildFocusTargets } from "./debugFocus.js";
import { normalizeToEmittedWorkflowResult } from "./workflowResultNormalize.js";
import type { WorkflowEngineResult, WorkflowResult } from "./types.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("buildFocusTargets", () => {
  it("returns empty targets when failureAnalysis is null (trusted complete)", () => {
    const raw = JSON.parse(
      readFileSync(path.join(root, "examples", "debug-corpus", "run_ok", "workflow-result.json"), "utf8"),
    ) as WorkflowEngineResult | WorkflowResult;
    const wr = normalizeToEmittedWorkflowResult(raw);
    const load = loadEventsForWorkflow(
      path.join(root, "examples", "debug-corpus", "run_ok", "events.ndjson"),
      wr.workflowId,
    );
    const trace = buildExecutionTraceView({
      workflowId: wr.workflowId,
      runEvents: load.runEvents,
      malformedEventLineCount: load.malformedEventLineCount,
      workflowResult: wr,
    });
    expect(buildFocusTargets(wr, trace)).toEqual({ targets: [] });
  });

  it("maps failureAnalysis evidence seq to golden focus targets (wf_inconsistent fixture)", () => {
    const raw = JSON.parse(
      readFileSync(path.join(root, "test", "fixtures", "wf_inconsistent_result.json"), "utf8"),
    ) as WorkflowEngineResult | WorkflowResult;
    const wr = normalizeToEmittedWorkflowResult(raw);
    const load = loadEventsForWorkflow(path.join(root, "examples", "events.ndjson"), wr.workflowId);
    const trace = buildExecutionTraceView({
      workflowId: wr.workflowId,
      runEvents: load.runEvents,
      malformedEventLineCount: load.malformedEventLineCount,
      workflowResult: wr,
    });
    const out = buildFocusTargets(wr, trace);
    expect(out.targets).toEqual([
      {
        kind: "seq",
        value: 0,
        rationale: "failureAnalysis.evidence[0] scope=step seq=0",
      },
    ]);
  });
});
