import { describe, expect, it } from "vitest";
import { aggregateWorkflow } from "../src/aggregate.js";
import type { StepOutcome } from "../src/types.js";

function step(partial: Partial<StepOutcome> & Pick<StepOutcome, "seq" | "toolId" | "status">): StepOutcome {
  return {
    intendedEffect: "",
    verificationRequest: null,
    reasons: [],
    evidenceSummary: {},
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
  });

  it("incomplete when runLevelCodes non-empty even if steps verified", () => {
    const r = aggregateWorkflow(
      "w",
      [step({ seq: 0, toolId: "t", status: "verified" })],
      ["DUPLICATE_SEQ"],
    );
    expect(r.status).toBe("incomplete");
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
  });

  it("incomplete when zero steps", () => {
    const r = aggregateWorkflow("w", [], []);
    expect(r.status).toBe("incomplete");
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
