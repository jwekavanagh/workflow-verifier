import { runLevelIssue } from "./failureCatalog.js";
import type {
  EventSequenceIntegrity,
  Reason,
  StepOutcome,
  VerificationPolicy,
  WorkflowResult,
  WorkflowStatus,
} from "./types.js";

export function aggregateWorkflow(
  workflowId: string,
  steps: StepOutcome[],
  runLevelReasonsIncoming: Reason[],
  verificationPolicy: VerificationPolicy,
  eventSequenceIntegrity: EventSequenceIntegrity,
): WorkflowResult {
  const runLevelReasons: Reason[] = [...runLevelReasonsIncoming];
  if (steps.length === 0) {
    runLevelReasons.push(runLevelIssue("NO_STEPS_FOR_WORKFLOW"));
  }
  const runLevelCodes = runLevelReasons.map((r) => r.code);

  let status: WorkflowStatus;

  const hasIncompleteStep = steps.some((s) => s.status === "incomplete_verification");
  const hasBadRealWorld = steps.some(
    (s) => s.status === "missing" || s.status === "inconsistent" || s.status === "partially_verified",
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
    schemaVersion: 4,
    workflowId,
    status,
    runLevelCodes: [...runLevelCodes],
    runLevelReasons: [...runLevelReasons],
    verificationPolicy,
    eventSequenceIntegrity,
    steps,
  };
}
