import { readFileSync } from "fs";
import { CLI_OPERATIONAL_CODES, runLevelIssue } from "./failureCatalog.js";
import { prepareWorkflowEvents } from "./prepareWorkflowEvents.js";
import type { LoadEventsResult, Reason, RunEvent, ToolObservedEvent } from "./types.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import { TruthLayerError } from "./truthLayerError.js";

const validateEvent = loadSchemaValidator("event");

let testThrowInvocationCounter = 0;

/** Clears the per-process counter used with `AGENTSKEPTIC_TEST_THROW_ON_LOAD_EVENTS` (Vitest only). */
export function resetLoadEventsTestThrowInvocationCounter(): void {
  testThrowInvocationCounter = 0;
}

function isToolObserved(ev: RunEvent): ev is ToolObservedEvent {
  return ev.type === "tool_observed";
}

export function loadEventsForWorkflow(
  eventsFilePath: string,
  workflowId: string,
): LoadEventsResult {
  if (process.env.AGENTSKEPTIC_TEST_THROW_ON_LOAD_EVENTS === "1") {
    testThrowInvocationCounter += 1;
    if (testThrowInvocationCounter === 2) {
      throw new Error("INJECTED_SECRET_MARKER");
    }
  }
  const runLevelReasons: Reason[] = [];
  let raw: string;
  try {
    raw = readFileSync(eventsFilePath, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new TruthLayerError(CLI_OPERATIONAL_CODES.EVENTS_READ_FAILED, msg, { cause: e });
  }

  const allLines = raw.split(/\r?\n/);
  let eventFileNonEmptyLines = 0;
  for (const line of allLines) {
    if (line.trim().length > 0) {
      eventFileNonEmptyLines += 1;
    }
  }

  const toolCandidates: ToolObservedEvent[] = [];
  const runEvents: RunEvent[] = [];
  let malformedEventLineCount = 0;
  let schemaValidEvents = 0;
  let toolObservedForRequestedWorkflowId = 0;
  let toolObservedForOtherWorkflowIds = 0;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i]!;
    if (line.trim().length === 0) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      malformedEventLineCount += 1;
      runLevelReasons.push(runLevelIssue("MALFORMED_EVENT_LINE"));
      continue;
    }
    if (!validateEvent(parsed)) {
      malformedEventLineCount += 1;
      runLevelReasons.push(runLevelIssue("MALFORMED_EVENT_LINE"));
      continue;
    }
    const ev = parsed as RunEvent;
    schemaValidEvents += 1;
    if (isToolObserved(ev)) {
      if (ev.workflowId === workflowId) {
        toolObservedForRequestedWorkflowId += 1;
      } else {
        toolObservedForOtherWorkflowIds += 1;
      }
    }
    if (ev.workflowId !== workflowId) {
      continue;
    }
    runEvents.push(ev);
    if (isToolObserved(ev)) {
      toolCandidates.push(ev);
    }
  }

  const { eventsSorted, eventSequenceIntegrity } = prepareWorkflowEvents(toolCandidates);

  return {
    events: eventsSorted,
    runEvents,
    runLevelReasons,
    eventSequenceIntegrity,
    malformedEventLineCount,
    eventFileAggregateCounts: {
      eventFileNonEmptyLines,
      schemaValidEvents,
      toolObservedForRequestedWorkflowId,
      toolObservedForOtherWorkflowIds,
    },
  };
}
