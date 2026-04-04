import { analyzeEventSequenceIntegrity } from "./eventSequenceIntegrity.js";
import { stableSortEventsBySeq } from "./planLogicalSteps.js";
import type { EventSequenceIntegrity, ToolObservedEvent } from "./types.js";

export function prepareWorkflowEvents(captureOrder: ToolObservedEvent[]): {
  eventsSorted: ToolObservedEvent[];
  eventSequenceIntegrity: EventSequenceIntegrity;
} {
  const eventSequenceIntegrity = analyzeEventSequenceIntegrity(captureOrder);
  const eventsSorted = stableSortEventsBySeq(captureOrder);
  return { eventsSorted, eventSequenceIntegrity };
}
