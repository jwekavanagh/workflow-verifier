import { readFileSync } from "fs";
import { CLI_OPERATIONAL_CODES, runLevelIssue } from "./failureCatalog.js";
import { prepareWorkflowEvents } from "./prepareWorkflowEvents.js";
import type { LoadEventsResult, Reason, ToolObservedEvent } from "./types.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import { TruthLayerError } from "./truthLayerError.js";

const validateEvent = loadSchemaValidator("event");

export function loadEventsForWorkflow(
  eventsFilePath: string,
  workflowId: string,
): LoadEventsResult {
  const runLevelReasons: Reason[] = [];
  let raw: string;
  try {
    raw = readFileSync(eventsFilePath, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new TruthLayerError(CLI_OPERATIONAL_CODES.EVENTS_READ_FAILED, msg, { cause: e });
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const candidates: ToolObservedEvent[] = [];

  for (let i = 0; i < lines.length; i++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]!) as unknown;
    } catch {
      runLevelReasons.push(runLevelIssue("MALFORMED_EVENT_LINE"));
      continue;
    }
    if (!validateEvent(parsed)) {
      runLevelReasons.push(runLevelIssue("MALFORMED_EVENT_LINE"));
      continue;
    }
    const ev = parsed as ToolObservedEvent;
    if (ev.workflowId !== workflowId) continue;
    candidates.push(ev);
  }

  const { eventsSorted, eventSequenceIntegrity } = prepareWorkflowEvents(candidates);

  return { events: eventsSorted, runLevelReasons, eventSequenceIntegrity };
}
