import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadEventsForWorkflow } from "./loadEvents.js";
import { formatNoStepsForWorkflowMessage } from "./noStepsMessage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, "..", "test", "fixtures", "adoption-validation", "wrong-workflow-id.events.ndjson");

describe("loadEvents eventFileAggregateCounts", () => {
  it("counts wrong-workflow-id fixture for wf_requested", () => {
    const { eventFileAggregateCounts } = loadEventsForWorkflow(fixture, "wf_requested");
    expect(eventFileAggregateCounts).toEqual({
      eventFileNonEmptyLines: 3,
      schemaValidEvents: 2,
      toolObservedForRequestedWorkflowId: 0,
      toolObservedForOtherWorkflowIds: 2,
    });
  });
});

describe("formatNoStepsForWorkflowMessage", () => {
  it("matches golden for wf_requested and fixture counts", () => {
    const { eventFileAggregateCounts } = loadEventsForWorkflow(fixture, "wf_requested");
    const msg = formatNoStepsForWorkflowMessage("wf_requested", eventFileAggregateCounts);
    expect(msg).toBe(
      'No tool_observed events for workflowId "wf_requested" after filtering. event_file_non_empty_lines=3 schema_valid_events=2 tool_observed_for_workflow=0 tool_observed_other_workflows=2.',
    );
  });
});
