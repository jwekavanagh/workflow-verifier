import { describe, expect, it } from "vitest";
import { analyzeEventSequenceIntegrity } from "./eventSequenceIntegrity.js";
import { prepareWorkflowEvents } from "./prepareWorkflowEvents.js";
import { eventSequenceIssue, eventSequenceTimestampNotMonotonicReason } from "./failureCatalog.js";
import type { ToolObservedEvent } from "./types.js";

function ev(overrides: Partial<ToolObservedEvent> & Pick<ToolObservedEvent, "seq" | "toolId">): ToolObservedEvent {
  return {
    schemaVersion: 1,
    workflowId: "w",
    type: "tool_observed",
    params: {},
    ...overrides,
  };
}

describe("analyzeEventSequenceIntegrity", () => {
  it("empty capture is normal", () => {
    expect(analyzeEventSequenceIntegrity([])).toEqual({ kind: "normal" });
  });

  it("detects non-monotonic seq in capture order", () => {
    const r = analyzeEventSequenceIntegrity([ev({ seq: 1, toolId: "a" }), ev({ seq: 0, toolId: "b" })]);
    expect(r).toEqual({
      kind: "irregular",
      reasons: [eventSequenceIssue("CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ")],
    });
  });

  it("monotonic seq including duplicates is normal without timestamp issues", () => {
    expect(
      analyzeEventSequenceIntegrity([ev({ seq: 0, toolId: "a" }), ev({ seq: 0, toolId: "a" }), ev({ seq: 1, toolId: "b" })]),
    ).toEqual({ kind: "normal" });
  });

  it("detects first decreasing timestamp pair in seq-sorted order", () => {
    const r = analyzeEventSequenceIntegrity([
      ev({ seq: 0, toolId: "a", timestamp: "2020-01-02T00:00:00.000Z" }),
      ev({ seq: 1, toolId: "b", timestamp: "2020-01-01T00:00:00.000Z" }),
    ]);
    expect(r).toEqual({
      kind: "irregular",
      reasons: [eventSequenceTimestampNotMonotonicReason(0, 1)],
    });
  });

  it("skips timestamp pair when parse is not finite", () => {
    expect(
      analyzeEventSequenceIntegrity([
        ev({ seq: 0, toolId: "a", timestamp: "not-a-date" }),
        ev({ seq: 1, toolId: "b", timestamp: "2020-01-01T00:00:00.000Z" }),
      ]),
    ).toEqual({ kind: "normal" });
  });

  it("capture irregular then timestamp: two reasons in order", () => {
    const r = analyzeEventSequenceIntegrity([
      ev({ seq: 1, toolId: "a", timestamp: "2020-01-02T00:00:00.000Z" }),
      ev({ seq: 0, toolId: "b", timestamp: "2020-01-03T00:00:00.000Z" }),
    ]);
    expect(r.kind).toBe("irregular");
    if (r.kind === "irregular") {
      expect(r.reasons).toHaveLength(2);
      expect(r.reasons[0]).toEqual(eventSequenceIssue("CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ"));
      expect(r.reasons[1]).toEqual(eventSequenceTimestampNotMonotonicReason(0, 1));
    }
  });
});

describe("prepareWorkflowEvents", () => {
  it("sorts by seq stable and preserves analyzer output", () => {
    const capture = [ev({ seq: 2, toolId: "x" }), ev({ seq: 0, toolId: "y" }), ev({ seq: 1, toolId: "z" })];
    const { eventsSorted, eventSequenceIntegrity } = prepareWorkflowEvents(capture);
    expect(eventsSorted.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(eventSequenceIntegrity.kind).toBe("irregular");
  });
});
