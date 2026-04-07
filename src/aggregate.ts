import { runLevelIssue } from "./failureCatalog.js";
import { createEmptyVerificationRunContext } from "./verificationRunContext.js";
import { enrichStepsWithFailureDiagnostics } from "./verificationDiagnostics.js";
import type {
  EventSequenceIntegrity,
  Reason,
  StepOutcome,
  VerificationPolicy,
  WorkflowEngineResult,
  WorkflowStatus,
} from "./types.js";

export function aggregateWorkflow(
  workflowId: string,
  steps: StepOutcome[],
  runLevelReasonsIncoming: Reason[],
  verificationPolicy: VerificationPolicy,
  eventSequenceIntegrity: EventSequenceIntegrity,
): WorkflowEngineResult {
  const runLevelReasons: Reason[] = [...runLevelReasonsIncoming];
  if (steps.length === 0) {
    runLevelReasons.push(runLevelIssue("NO_STEPS_FOR_WORKFLOW"));
  }
  let status: WorkflowStatus;

  const hasIncompleteStep = steps.some((s) => s.status === "incomplete_verification");
  const hasBadRealWorld = steps.some(
    (s) => s.status === "missing" || s.status === "inconsistent" || s.status === "partially_verified",
  );

  if (runLevelReasons.length > 0 || steps.length === 0 || hasIncompleteStep) {
    status = "incomplete";
  } else if (hasBadRealWorld) {
    status = "inconsistent";
  } else if (steps.every((s) => s.status === "verified")) {
    status = "complete";
  } else {
    status = "incomplete";
  }

  const enrichedSteps = enrichStepsWithFailureDiagnostics(steps);

  return {
    schemaVersion: 8,
    workflowId,
    status,
    runLevelReasons: [...runLevelReasons],
    verificationPolicy,
    eventSequenceIntegrity,
    steps: enrichedSteps,
    verificationRunContext: createEmptyVerificationRunContext(),
  };
}
