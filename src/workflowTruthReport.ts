import type { StepStatus, WorkflowResult, WorkflowStatus } from "./types.js";

export const STEP_STATUS_TRUTH_LABELS: Record<StepStatus, string> = {
  verified: "VERIFIED",
  missing: "FAILED_ROW_MISSING",
  partial: "UNCERTAIN_NULL_FIELD",
  inconsistent: "FAILED_VALUE_MISMATCH",
  incomplete_verification: "INCOMPLETE_CANNOT_VERIFY",
};

const TRUST_LINE_BY_STATUS: Record<WorkflowStatus, string> = {
  complete: "TRUSTED: Every step matched the database under the configured verification rules.",
  incomplete: "NOT_TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.",
  inconsistent:
    "NOT_TRUSTED: At least one step failed verification against the database (determinate failure).",
};

const RUN_LEVEL_EXPLANATIONS: Record<string, string> = {
  MALFORMED_EVENT_LINE:
    "Event line was missing, invalid JSON, or failed schema validation for a tool observation.",
  DUPLICATE_SEQ: "Duplicate seq values appeared for this workflow; ordering may be unreliable.",
};

const UNKNOWN_RUN_LEVEL = "Unknown run-level code (forward compatibility).";

function sanitizeOneLineId(value: string): string {
  return value.replace(/\r\n|\r|\n/g, "_");
}

function singleLineIntended(effect: string): string {
  const withSpaces = effect.replace(/\r\n|\r|\n/g, " ");
  return withSpaces.replace(/ +/g, " ").trim();
}

function runLevelExplanation(code: string): string {
  return RUN_LEVEL_EXPLANATIONS[code] ?? UNKNOWN_RUN_LEVEL;
}

export function formatWorkflowTruthReport(result: WorkflowResult): string {
  const lines: string[] = [];

  lines.push(`workflow_id: ${sanitizeOneLineId(result.workflowId)}`);
  lines.push(`workflow_status: ${result.status}`);
  lines.push(`trust: ${TRUST_LINE_BY_STATUS[result.status]}`);

  if (result.runLevelCodes.length === 0) {
    lines.push("run_level: (none)");
  } else {
    lines.push("run_level:");
    for (const code of result.runLevelCodes) {
      lines.push(`  - ${code}: ${runLevelExplanation(code)}`);
    }
  }

  lines.push("steps:");
  for (const s of result.steps) {
    const toolId = sanitizeOneLineId(s.toolId);
    const label = STEP_STATUS_TRUTH_LABELS[s.status];
    lines.push(`  - seq=${s.seq} tool=${toolId} status=${label}`);
    for (const r of s.reasons) {
      const msg = r.message.trim();
      const human = msg.length > 0 ? msg : "(no message)";
      let line = `    reason: [${r.code}] ${human}`;
      if (r.field !== undefined && r.field.length > 0) {
        line += ` field=${r.field}`;
      }
      lines.push(line);
    }
    const intended = singleLineIntended(s.intendedEffect);
    if (intended.length > 0) {
      lines.push(`    intended: ${intended}`);
    }
  }

  return lines.join("\n");
}
