import {
  failureDiagnosticForEventSequenceCode,
  failureDiagnosticForRunLevelCode,
  failureDiagnosticForStep,
  formatVerificationTargetSummary,
} from "./verificationDiagnostics.js";
import type {
  FailureDiagnostic,
  Reason,
  StepOutcome,
  StepStatus,
  WorkflowEngineResult,
  WorkflowResult,
  WorkflowStatus,
  WorkflowTruthEffect,
  WorkflowTruthReport,
  WorkflowTruthStep,
} from "./types.js";

/** Plain-language `result=` line in the human report only. JSON `outcomeLabel` stays machine-stable (see STEP_STATUS_TRUTH_LABELS). */
export const HUMAN_REPORT_RESULT_PHRASE: Record<WorkflowTruthStep["outcomeLabel"], string> = {
  VERIFIED: "Matched the database.",
  FAILED_ROW_MISSING:
    "Expected row is missing from the database (the log implies a write that is not present).",
  FAILED_VALUE_MISMATCH: "A row was found, but required values do not match.",
  INCOMPLETE_CANNOT_VERIFY:
    "This step could not be fully verified (registry, connector, or data shape issue).",
  PARTIALLY_VERIFIED: "Some intended database effects matched; others did not.",
  UNCERTAIN_NOT_OBSERVED_WITHIN_WINDOW:
    "The expected row did not appear within the verification window.",
};

const HUMAN_REPORT_EFFECT_RESULT_PHRASE: Record<WorkflowTruthEffect["outcomeLabel"], string> = {
  VERIFIED: HUMAN_REPORT_RESULT_PHRASE.VERIFIED,
  FAILED_ROW_MISSING: HUMAN_REPORT_RESULT_PHRASE.FAILED_ROW_MISSING,
  FAILED_VALUE_MISMATCH: HUMAN_REPORT_RESULT_PHRASE.FAILED_VALUE_MISMATCH,
  INCOMPLETE_CANNOT_VERIFY: HUMAN_REPORT_RESULT_PHRASE.INCOMPLETE_CANNOT_VERIFY,
};

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

function trustLineBaseForEngine(engine: WorkflowEngineResult): string {
  if (
    engine.status === "incomplete" &&
    engine.runLevelReasons.length === 0 &&
    engine.steps.some((s) => s.status === "uncertain") &&
    !engine.steps.some((s) =>
      ["missing", "inconsistent", "partially_verified", "incomplete_verification"].includes(s.status),
    )
  ) {
    return TRUST_LINE_UNCERTAIN_WITHIN_WINDOW;
  }
  return TRUST_LINE_BY_STATUS[engine.status];
}

function trustSummaryForEngine(engine: WorkflowEngineResult): string {
  const base = trustLineBaseForEngine(engine);
  if (engine.eventSequenceIntegrity.kind === "irregular") {
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

function copyReason(r: Reason): Reason {
  const out: Reason = { code: r.code, message: r.message };
  if (r.field !== undefined && r.field.length > 0) out.field = r.field;
  return out;
}

function pushHumanReasonLines(lines: string[], r: Reason, indent: string): void {
  const msg = r.message.trim();
  const human = msg.length > 0 ? msg : "(no message)";
  let detailLine = `${indent}detail: ${human}`;
  if (r.field !== undefined && r.field.length > 0) {
    detailLine += ` field=${r.field}`;
  }
  lines.push(detailLine);
  lines.push(`${indent}reference_code: ${r.code}`);
}

function buildTruthStep(s: StepOutcome): WorkflowTruthStep {
  const label = STEP_STATUS_TRUTH_LABELS[s.status] as WorkflowTruthStep["outcomeLabel"];
  const vt = formatVerificationTargetSummary(s.verificationRequest);
  const intended = singleLineIntended(s.intendedEffect);
  const base: WorkflowTruthStep = {
    seq: s.seq,
    toolId: s.toolId,
    outcomeLabel: label,
    observations: {
      evaluatedOrdinal: s.evaluatedObservationOrdinal,
      repeatCount: s.repeatObservationCount,
    },
    reasons: s.reasons.map(copyReason),
    intendedEffect: intended,
    verifyTarget: vt === null ? null : vt,
  };
  if (s.status !== "verified") {
    const cat = (s.failureDiagnostic ?? failureDiagnosticForStep(s)) as FailureDiagnostic;
    base.failureCategory = cat;
  }
  const rawEffects = s.evidenceSummary.effects;
  const effects: WorkflowTruthEffect[] = [];
  if (Array.isArray(rawEffects)) {
    for (const row of rawEffects) {
      const eff = parseEffectEvidenceRow(row);
      if (eff === null) continue;
      effects.push({
        id: sanitizeOneLineId(eff.id),
        outcomeLabel: EFFECT_STATUS_TRUTH_LABELS[eff.status] as WorkflowTruthEffect["outcomeLabel"],
        reasons: eff.reasons.map(copyReason),
      });
    }
  }
  if (effects.length > 0) {
    base.effects = effects;
  }
  return base;
}

export function buildWorkflowTruthReport(engine: WorkflowEngineResult): WorkflowTruthReport {
  const runLevelIssues =
    engine.runLevelReasons.length === 0
      ? []
      : engine.runLevelReasons.map((r) => ({
          code: r.code,
          message: r.message,
          category: failureDiagnosticForRunLevelCode(r.code) as FailureDiagnostic,
        }));

  const eventSequence =
    engine.eventSequenceIntegrity.kind === "normal"
      ? ({ kind: "normal" } as const)
      : ({
          kind: "irregular",
          issues: engine.eventSequenceIntegrity.reasons.map((r) => ({
            code: r.code,
            message: r.message,
            category: failureDiagnosticForEventSequenceCode(r.code) as FailureDiagnostic,
          })),
        } as const);

  return {
    schemaVersion: 1,
    workflowId: engine.workflowId,
    workflowStatus: engine.status,
    trustSummary: trustSummaryForEngine(engine),
    runLevelIssues,
    eventSequence,
    steps: engine.steps.map(buildTruthStep),
  };
}

export function finalizeEmittedWorkflowResult(engine: WorkflowEngineResult): WorkflowResult {
  return {
    ...engine,
    schemaVersion: 6,
    workflowTruthReport: buildWorkflowTruthReport(engine),
  };
}

export function formatWorkflowTruthReportStruct(truth: WorkflowTruthReport): string {
  const lines: string[] = [];

  lines.push(`workflow_id: ${sanitizeOneLineId(truth.workflowId)}`);
  lines.push(`workflow_status: ${truth.workflowStatus}`);
  lines.push(`trust: ${truth.trustSummary}`);

  if (truth.runLevelIssues.length === 0) {
    lines.push("run_level: (none)");
  } else {
    lines.push("run_level:");
    for (const r of truth.runLevelIssues) {
      const msg = r.message.trim();
      const human = msg.length > 0 ? msg : "(no message)";
      lines.push(`  - detail: ${human}`);
      lines.push(`    category: ${r.category}`);
      lines.push(`    reference_code: ${r.code}`);
    }
  }

  if (truth.eventSequence.kind === "normal") {
    lines.push("event_sequence: normal");
  } else {
    lines.push("event_sequence: irregular");
    for (const r of truth.eventSequence.issues) {
      const msg = r.message.trim();
      const human = msg.length > 0 ? msg : "(no message)";
      lines.push(`  - detail: ${human}`);
      lines.push(`    category: ${r.category}`);
      lines.push(`    reference_code: ${r.code}`);
    }
  }

  lines.push("steps:");
  for (const s of truth.steps) {
    const toolId = sanitizeOneLineId(s.toolId);
    const resultPhrase = HUMAN_REPORT_RESULT_PHRASE[s.outcomeLabel];
    lines.push(`  - seq=${s.seq} tool=${toolId} result=${resultPhrase}`);
    lines.push(
      `    observations: evaluated=${s.observations.evaluatedOrdinal} of ${s.observations.repeatCount} in_capture_order`,
    );
    if (s.outcomeLabel !== "VERIFIED") {
      const cat = s.failureCategory!;
      lines.push(`    category: ${cat}`);
      if (s.verifyTarget !== null) {
        lines.push(`    verify_target: ${s.verifyTarget}`);
      }
    }
    for (const r of s.reasons) {
      pushHumanReasonLines(lines, r, "    ");
    }
    if (s.intendedEffect.length > 0) {
      lines.push(`    intended: ${s.intendedEffect}`);
    }

    if (s.effects !== undefined) {
      for (const eff of s.effects) {
        const eid = sanitizeOneLineId(eff.id);
        const effPhrase = HUMAN_REPORT_EFFECT_RESULT_PHRASE[eff.outcomeLabel];
        lines.push(`    effect: id=${eid} result=${effPhrase}`);
        for (const r of eff.reasons) {
          pushHumanReasonLines(lines, r, "      ");
        }
      }
    }
  }

  return lines.join("\n");
}

export function formatWorkflowTruthReport(engine: WorkflowEngineResult): string {
  return formatWorkflowTruthReportStruct(buildWorkflowTruthReport(engine));
}
