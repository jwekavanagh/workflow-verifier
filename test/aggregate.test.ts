import { describe, expect, it } from "vitest";
import { aggregateWorkflow } from "../src/aggregate.js";
import type { StepOutcome } from "../src/types.js";

function step(partial: Partial<StepOutcome> & Pick<StepOutcome, "seq" | "toolId" | "status">): StepOutcome {
  return {
    intendedEffect: "",
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
    );
    expect(r.status).toBe("complete");
    expect(r.schemaVersion).toBe(2);
    expect(r.runLevelReasons).toEqual([]);
    expect(r.runLevelCodes).toEqual([]);
  });

  it("incomplete when run-level reasons non-empty even if steps verified", () => {
    const r = aggregateWorkflow(
      "w",
      [step({ seq: 0, toolId: "t", status: "verified" })],
      [{ code: "TEST_BLOCKING_CODE", message: "blocking" }],
    );
    expect(r.status).toBe("incomplete");
    expect(r.runLevelCodes).toEqual(["TEST_BLOCKING_CODE"]);
  });

  it("incomplete when any incomplete_verification", () => {
    const r = aggregateWorkflow(
      "w",
      [
        step({ seq: 0, toolId: "t", status: "missing" }),
        step({ seq: 1, toolId: "t", status: "incomplete_verification" }),
      ],
      [],
    );
    expect(r.status).toBe("incomplete");
  });

  it("inconsistent when missing step and no incomplete_verification", () => {
    const r = aggregateWorkflow(
      "w",
      [step({ seq: 0, toolId: "t", status: "missing" })],
      [],
    );
    expect(r.status).toBe("inconsistent");
    expect(r.runLevelReasons).toEqual([]);
  });

  it("inconsistent when partially_verified (step-level partial multi-effect)", () => {
    const r = aggregateWorkflow(
      "w",
      [step({ seq: 0, toolId: "t", status: "partially_verified" })],
      [],
    );
    expect(r.status).toBe("inconsistent");
  });

  it("incomplete when zero steps adds NO_STEPS_FOR_WORKFLOW", () => {
    const r = aggregateWorkflow("w", [], []);
    expect(r.status).toBe("incomplete");
    expect(r.runLevelCodes).toEqual(["NO_STEPS_FOR_WORKFLOW"]);
    expect(r.runLevelReasons.map((x) => x.code)).toEqual(["NO_STEPS_FOR_WORKFLOW"]);
  });

  it("params.ok cannot produce complete without verified — missing stays inconsistent", () => {
    const r = aggregateWorkflow(
      "w",
      [step({ seq: 0, toolId: "t", status: "missing" })],
      [],
    );
    expect(r.status).not.toBe("complete");
  });
});
