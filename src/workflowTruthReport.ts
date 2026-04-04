import type { Reason, StepStatus, WorkflowResult, WorkflowStatus } from "./types.js";

export const STEP_STATUS_TRUTH_LABELS: Record<StepStatus, string> = {
  verified: "VERIFIED",
  missing: "FAILED_ROW_MISSING",
  inconsistent: "FAILED_VALUE_MISMATCH",
  incomplete_verification: "INCOMPLETE_CANNOT_VERIFY",
  partially_verified: "PARTIALLY_VERIFIED",
  uncertain: "UNCERTAIN_NOT_OBSERVED_WITHIN_WINDOW",
};

/** Per-effect rows use reconciler statuses only (never `partially_verified` or `uncertain`). */
export const EFFECT_STATUS_TRUTH_LABELS: Record<
  Exclude<StepStatus, "partially_verified" | "uncertain">,
  string
> = {
  verified: "VERIFIED",
  missing: "FAILED_ROW_MISSING",
  inconsistent: "FAILED_VALUE_MISMATCH",
  incomplete_verification: "INCOMPLETE_CANNOT_VERIFY",
};

const TRUST_LINE_BY_STATUS: Record<WorkflowStatus, string> = {
  complete: "TRUSTED: Every step matched the database under the configured verification rules.",
  incomplete: "NOT TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.",
  inconsistent:
    "NOT TRUSTED: At least one step failed verification against the database (determinate failure).",
};

/** Human report trust line when the only failures are `uncertain` (eventual window exhausted). */
export const TRUST_LINE_UNCERTAIN_WITHIN_WINDOW =
  "NOT TRUSTED: At least one step could not be confirmed within the verification window (row not observed; replication or processing delay is possible).";

/** Appended to `trust:` when `eventSequenceIntegrity.kind === "irregular"` (normative; see docs). */
export const TRUST_LINE_EVENT_SEQUENCE_IRREGULAR_SUFFIX =
  "Event capture or timestamps were irregular; verification used seq-sorted order. See event_sequence below.";

function trustLineBaseForResult(result: WorkflowResult): string {
  if (
    result.status === "incomplete" &&
    result.runLevelReasons.length === 0 &&
    result.steps.some((s) => s.status === "uncertain") &&
    !result.steps.some((s) =>
      ["missing", "inconsistent", "partially_verified", "incomplete_verification"].includes(s.status),
    )
  ) {
    return TRUST_LINE_UNCERTAIN_WITHIN_WINDOW;
  }
  return TRUST_LINE_BY_STATUS[result.status];
}

function trustLineForResult(result: WorkflowResult): string {
  const base = trustLineBaseForResult(result);
  if (result.eventSequenceIntegrity.kind === "irregular") {
    return `${base} ${TRUST_LINE_EVENT_SEQUENCE_IRREGULAR_SUFFIX}`;
  }
  return base;
}

function sanitizeOneLineId(value: string): string {
  return value.replace(/\r\n|\r|\n/g, "_");
}

function singleLineIntended(effect: string): string {
  const withSpaces = effect.replace(/\r\n|\r|\n/g, " ");
  return withSpaces.replace(/ +/g, " ").trim();
}

type EffectEvidenceRow = {
  id: string;
  status: Exclude<StepStatus, "partially_verified" | "uncertain">;
  reasons: Reason[];
};

const RECONCILER_STEP_STATUSES = new Set<string>([
  "verified",
  "missing",
  "inconsistent",
  "incomplete_verification",
]);

function parseEffectEvidenceRow(v: unknown): EffectEvidenceRow | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || !Array.isArray(o.reasons) || typeof o.status !== "string") {
    return null;
  }
  if (!RECONCILER_STEP_STATUSES.has(o.status)) return null;
  return {
    id: o.id,
    status: o.status as EffectEvidenceRow["status"],
    reasons: o.reasons as Reason[],
  };
}

export function formatWorkflowTruthReport(result: WorkflowResult): string {
  const lines: string[] = [];

  lines.push(`workflow_id: ${sanitizeOneLineId(result.workflowId)}`);
  lines.push(`workflow_status: ${result.status}`);
  lines.push(`trust: ${trustLineForResult(result)}`);

  if (result.runLevelReasons.length === 0) {
    lines.push("run_level: (none)");
  } else {
    lines.push("run_level:");
    for (const r of result.runLevelReasons) {
      const msg = r.message.trim();
      const human = msg.length > 0 ? msg : "(no message)";
      lines.push(`  - ${r.code}: ${human}`);
    }
  }

  if (result.eventSequenceIntegrity.kind === "normal") {
    lines.push("event_sequence: normal");
  } else {
    lines.push("event_sequence: irregular");
    for (const r of result.eventSequenceIntegrity.reasons) {
      const msg = r.message.trim();
      const human = msg.length > 0 ? msg : "(no message)";
      lines.push(`  - ${r.code}: ${human}`);
    }
  }

  lines.push("steps:");
  for (const s of result.steps) {
    const toolId = sanitizeOneLineId(s.toolId);
    const label = STEP_STATUS_TRUTH_LABELS[s.status];
    lines.push(`  - seq=${s.seq} tool=${toolId} status=${label}`);
    lines.push(
      `    observations: evaluated=${s.evaluatedObservationOrdinal} of ${s.repeatObservationCount} in_capture_order`,
    );
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

    const rawEffects = s.evidenceSummary.effects;
    if (Array.isArray(rawEffects)) {
      for (const row of rawEffects) {
        const eff = parseEffectEvidenceRow(row);
        if (eff === null) continue;
        const eid = sanitizeOneLineId(eff.id);
        const el = EFFECT_STATUS_TRUTH_LABELS[eff.status];
        lines.push(`    effect: id=${eid} status=${el}`);
        for (const r of eff.reasons) {
          const msg = r.message.trim();
          const human = msg.length > 0 ? msg : "(no message)";
          let line = `      reason: [${r.code}] ${human}`;
          if (r.field !== undefined && r.field.length > 0) {
            line += ` field=${r.field}`;
          }
          lines.push(line);
        }
      }
    }
  }

  return lines.join("\n");
}
