import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLI_OPERATIONAL_CODES } from "./failureCatalog.js";
import {
  assertValidRunEventParentGraph,
  buildExecutionTraceView,
  formatExecutionTraceText,
} from "./executionTrace.js";
import { loadEventsForWorkflow } from "./loadEvents.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import { TruthLayerError } from "./truthLayerError.js";
import type {
  ModelTurnRunEvent,
  RunEvent,
  ToolObservedEventV2,
  WorkflowEngineResult,
  WorkflowResult,
} from "./types.js";
import { finalizeEmittedWorkflowResult } from "./workflowTruthReport.js";

describe("assertValidRunEventParentGraph", () => {
  it("rejects duplicate runEventId", () => {
    const a: ToolObservedEventV2 = {
      schemaVersion: 2,
      workflowId: "w",
      runEventId: "x",
      type: "tool_observed",
      seq: 0,
      toolId: "t",
      params: {},
    };
    const b: ModelTurnRunEvent = {
      schemaVersion: 2,
      workflowId: "w",
      runEventId: "x",
      type: "model_turn",
      status: "completed",
    };
    try {
      assertValidRunEventParentGraph([a, b]);
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TruthLayerError);
      expect((e as TruthLayerError).code).toBe(CLI_OPERATIONAL_CODES.TRACE_DUPLICATE_RUN_EVENT_ID);
    }
  });

  it("rejects unknown parentRunEventId", () => {
    const ev: ModelTurnRunEvent = {
      schemaVersion: 2,
      workflowId: "w",
      runEventId: "b",
      parentRunEventId: "nope",
      type: "model_turn",
      status: "completed",
    };
    try {
      assertValidRunEventParentGraph([ev]);
      expect.fail("expected throw");
    } catch (e) {
      expect((e as TruthLayerError).code).toBe(CLI_OPERATIONAL_CODES.TRACE_UNKNOWN_PARENT_RUN_EVENT_ID);
    }
  });

  it("rejects parent forward reference", () => {
    const first: ModelTurnRunEvent = {
      schemaVersion: 2,
      workflowId: "w",
      runEventId: "b",
      parentRunEventId: "a",
      type: "model_turn",
      status: "completed",
    };
    const second: ModelTurnRunEvent = {
      schemaVersion: 2,
      workflowId: "w",
      runEventId: "a",
      type: "model_turn",
      status: "completed",
    };
    try {
      assertValidRunEventParentGraph([first, second]);
      expect.fail("expected throw");
    } catch (e) {
      expect((e as TruthLayerError).code).toBe(CLI_OPERATIONAL_CODES.TRACE_PARENT_FORWARD_REFERENCE);
    }
  });
});

describe("buildExecutionTraceView", () => {
  it("matches golden for completed trace (examples/trace-run.ndjson)", () => {
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    const p = path.join(root, "examples", "trace-run.ndjson");
    const load = loadEventsForWorkflow(p, "wtrace");
    expect(load.runEvents).toHaveLength(3);
    expect(load.events).toHaveLength(1);
    const view = buildExecutionTraceView({
      workflowId: "wtrace",
      runEvents: load.runEvents,
      malformedEventLineCount: load.malformedEventLineCount,
    });
    const v = loadSchemaValidator("execution-trace-view");
    expect(v(view)).toBe(true);
    expect(view.runCompletion).toBe("completed");
    expect(view.nodes[2]!.wireType).toBe("control");
    expect(view.nodes[2]!.traceStepKind).toBe("success");
    expect(view.backwardPaths[0]).toEqual({
      pathKind: "workflow_terminal",
      seedRunEventId: "c1",
      ancestorRunEventIds: ["c1", "t1", "m1"],
    });
    expect(formatExecutionTraceText(view)).toContain("workflow_terminal");
  });

  it("model_turn error as last node yields unknown_or_interrupted and workflow_terminal seed", () => {
    const runEvents: RunEvent[] = [
      {
        schemaVersion: 2,
        workflowId: "w",
        runEventId: "m1",
        type: "model_turn",
        status: "error",
      },
    ];
    const view = buildExecutionTraceView({
      workflowId: "w",
      runEvents,
      malformedEventLineCount: 0,
    });
    expect(view.runCompletion).toBe("unknown_or_interrupted");
    expect(view.nodes[0]!.traceStepKind).toBe("failed");
    expect(view.backwardPaths[0]!.pathKind).toBe("workflow_terminal");
    expect(view.backwardPaths[0]!.seedRunEventId).toBe("m1");
    expect(view.backwardPaths[0]!.ancestorRunEventIds).toEqual(["m1"]);
  });

  it("adds verification_step paths when WorkflowResult provided", () => {
    const runEvents: RunEvent[] = [
      {
        schemaVersion: 2,
        workflowId: "w",
        runEventId: "t1",
        type: "tool_observed",
        seq: 0,
        toolId: "crm.upsert_contact",
        params: { id: "c_ok", name: "Alice" },
      },
    ];
    const engine: WorkflowEngineResult = {
      schemaVersion: 6,
      workflowId: "w",
      status: "complete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
      verificationRunContext: {
        maxWireSchemaVersion: 2,
        retrievalEvents: [],
        controlEvents: [],
        modelTurnEvents: [],
        toolSkippedEvents: [],
        toolObservedIngestIndexBySeq: { "0": 0 },
        firstToolObservedIngestIndex: 0,
        hasRunCompletedControl: false,
        lastRunEvent: { ingestIndex: 0, type: "tool_observed" },
      },
      steps: [
        {
          seq: 0,
          toolId: "crm.upsert_contact",
          intendedEffect: "x",
          verificationRequest: {
            kind: "sql_row",
            table: "contacts",
            keyColumn: "id",
            keyValue: "c_ok",
            requiredFields: { name: "Alice" },
          },
          status: "verified",
          reasons: [],
          evidenceSummary: {},
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    const wr: WorkflowResult = finalizeEmittedWorkflowResult(engine);
    const view = buildExecutionTraceView({
      workflowId: "w",
      runEvents,
      malformedEventLineCount: 0,
      workflowResult: wr,
    });
    const verPaths = view.backwardPaths.filter((p) => p.pathKind === "verification_step");
    expect(verPaths).toHaveLength(1);
    expect(verPaths[0]).toMatchObject({
      pathKind: "verification_step",
      stepIndex: 0,
      seq: 0,
      seedRunEventId: "t1",
    });
    expect(view.nodes[0]!.verificationLink).toMatchObject({
      stepIndex: 0,
      engineStepStatus: "verified",
    });
    expect(view.nodes[0]!.traceStepKind).toBe("success");
  });
});
