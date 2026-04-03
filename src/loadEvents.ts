import { readFileSync } from "fs";
import type { ToolObservedEvent } from "./types.js";
import { loadSchemaValidator } from "./schemaLoad.js";

const validateEvent = loadSchemaValidator("event");

export function loadEventsForWorkflow(
  eventsFilePath: string,
  workflowId: string,
): { events: ToolObservedEvent[]; runLevelCodes: string[] } {
  const runLevelCodes: string[] = [];
  const raw = readFileSync(eventsFilePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const candidates: ToolObservedEvent[] = [];

  for (let i = 0; i < lines.length; i++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]!) as unknown;
    } catch {
      runLevelCodes.push("MALFORMED_EVENT_LINE");
      continue;
    }
    if (!validateEvent(parsed)) {
      runLevelCodes.push("MALFORMED_EVENT_LINE");
      continue;
    }
    const ev = parsed as ToolObservedEvent;
    if (ev.workflowId !== workflowId) continue;
    candidates.push(ev);
  }

  candidates.sort((a, b) => a.seq - b.seq);

  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i]!.seq === candidates[i - 1]!.seq) {
      runLevelCodes.push("DUPLICATE_SEQ");
      break;
    }
  }

  return { events: candidates, runLevelCodes };
}
