import { describe, expect, it } from "vitest";
import { aggregateWorkflow } from "../src/aggregate.js";
import type { EventSequenceIntegrity, StepOutcome, VerificationPolicy } from "../src/types.js";
import { eventSequenceIssue } from "../src/failureCatalog.js";

const strongPolicy: VerificationPolicy = {
  consistencyMode: "strong",
  verificationWindowMs: 0,
  pollIntervalMs: 0,
};

const eventSeqNormal: EventSequenceIntegrity = { kind: "normal" };

function step(partial: Partial<StepOutcome> & Pick<StepOutcome, "seq" | "toolId" | "status">): StepOutcome {
  return {
    intendedEffect: { narrative: "" },
    observedExecution: { paramsCanonical: "{}" },
    verificationRequest: null,
    reasons: [],
    evidenceSummary: {},
    repeatObservationCount: 1,
    evaluatedObservationOrdinal: 1,
    ...partial,
  };
}

describe("WorkflowAggregator precedence", () => {
  it("complete only when all verified and no run-level codes", () => {
    const r = aggregateWorkflow(
      "w",
      [step({ seq: 0, toolId: "t", status: "verified" })],
      [],
      strongPolicy,
      eventSeqNormal,
    );
    expect(r.status).toBe("complete");
    expect(r.schemaVersion).toBe(8);
    expect(r.eventSequenceIntegrity).toEqual(eventSeqNormal);
    expect(r.runLevelReasons).toEqual([]);
  });

  it("incomplete when run-level reasons non-empty even if steps verified", () => {
    const r = aggregateWorkflow(
      "w",
      [step({ seq: 0, toolId: "t", status: "verified" })],
      [{ code: "TEST_BLOCKING_CODE", message: "blocking" }],
      strongPolicy,
      eventSeqNormal,
    );
    expect(r.status).toBe("incomplete");
    expect(r.runLevelReasons.map((x) => x.code)).toEqual(["TEST_BLOCKING_CODE"]);
  });

  it("incomplete when any incomplete_verification", () => {
    const r = aggregateWorkflow(
      "w",
      [
        step({ seq: 0, toolId: "t", status: "missing" }),
        step({
          seq: 1,
          toolId: "t",
          status: "incomplete_verification",
          reasons: [{ code: "CONNECTOR_ERROR", message: "db" }],
        }),
      ],
      [],
      strongPolicy,
      eventSeqNormal,
    );
    expect(r.status).toBe("incomplete");
  });

  it("inconsistent when missing step and no incomplete_verification", () => {
    const r = aggregateWorkflow(
      "w",
      [step({ seq: 0, toolId: "t", status: "missing" })],
      [],
      strongPolicy,
      eventSeqNormal,
    );
    expect(r.status).toBe("inconsistent");
    expect(r.runLevelReasons).toEqual([]);
  });

  it("inconsistent when partially_verified (step-level partial multi-effect)", () => {
    const r = aggregateWorkflow(
      "w",
      [step({ seq: 0, toolId: "t", status: "partially_verified" })],
      [],
      strongPolicy,
      eventSeqNormal,
    );
    expect(r.status).toBe("inconsistent");
  });

  it("incomplete when zero steps adds NO_STEPS_FOR_WORKFLOW", () => {
    const r = aggregateWorkflow("w", [], [], strongPolicy, eventSeqNormal);
    expect(r.status).toBe("incomplete");
    expect(r.runLevelReasons.map((x) => x.code)).toEqual(["NO_STEPS_FOR_WORKFLOW"]);
    expect(r.eventSequenceIntegrity).toEqual(eventSeqNormal);
  });

  it("params.ok cannot produce complete without verified — missing stays inconsistent", () => {
    const r = aggregateWorkflow(
      "w",
      [step({ seq: 0, toolId: "t", status: "missing" })],
      [],
      strongPolicy,
      eventSeqNormal,
    );
    expect(r.status).not.toBe("complete");
  });

  it("incomplete when only uncertain steps (with verified)", () => {
    const r = aggregateWorkflow(
      "w",
      [
        step({ seq: 0, toolId: "t", status: "verified" }),
        step({ seq: 1, toolId: "t", status: "uncertain" }),
      ],
      [],
      strongPolicy,
      eventSeqNormal,
    );
    expect(r.status).toBe("incomplete");
  });

  it("inconsistent when uncertain and missing on different steps", () => {
    const r = aggregateWorkflow(
      "w",
      [
        step({ seq: 0, toolId: "t", status: "uncertain" }),
        step({ seq: 1, toolId: "t", status: "missing" }),
      ],
      [],
      strongPolicy,
      eventSeqNormal,
    );
    expect(r.status).toBe("inconsistent");
  });

  it("eventSequenceIntegrity irregular does not force incomplete when steps verified", () => {
    const irregular: EventSequenceIntegrity = {
      kind: "irregular",
      reasons: [eventSequenceIssue("CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ")],
    };
    const r = aggregateWorkflow(
      "w",
      [step({ seq: 0, toolId: "t", status: "verified" })],
      [],
      strongPolicy,
      irregular,
    );
    expect(r.status).toBe("complete");
    expect(r.eventSequenceIntegrity).toEqual(irregular);
  });
});
