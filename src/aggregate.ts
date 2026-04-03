import type { StepOutcome, WorkflowResult, WorkflowStatus } from "./types.js";

export function aggregateWorkflow(workflowId: string, steps: StepOutcome[], runLevelCodes: string[]): WorkflowResult {
  let status: WorkflowStatus;

  const hasIncompleteStep = steps.some((s) => s.status === "incomplete_verification");
  const hasBadRealWorld = steps.some(
    (s) => s.status === "missing" || s.status === "partial" || s.status === "inconsistent",
  );

  if (runLevelCodes.length > 0 || steps.length === 0 || hasIncompleteStep) {
    status = "incomplete";
  } else if (hasBadRealWorld) {
    status = "inconsistent";
  } else if (steps.every((s) => s.status === "verified")) {
    status = "complete";
  } else {
    status = "incomplete";
  }

  return {
    schemaVersion: 1,
    workflowId,
    status,
    runLevelCodes: [...runLevelCodes],
    steps,
  };
}
