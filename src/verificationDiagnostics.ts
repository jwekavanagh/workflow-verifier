import {
  EVENT_SEQUENCE_MESSAGES,
  OPERATIONAL_MESSAGE_MAX_CHARS,
  formatOperationalMessage,
} from "./failureCatalog.js";
import { compareUtf16Id } from "./resolveExpectation.js";
import { RESOLVE_FAILURE_CODES } from "./resolveFailureCodes.js";
import type { FailureDiagnostic, Reason, StepOutcome, StepVerificationRequest } from "./types.js";

export { RESOLVE_FAILURE_CODES };

/** Reason codes that produce effect `incomplete_verification` in reconciler.ts (connector + row read). */
export const RECONCILER_INCOMPLETE_VERIFICATION_CODES: ReadonlySet<string> = new Set([
  "CONNECTOR_ERROR",
  "ROW_SHAPE_MISMATCH",
  "UNREADABLE_VALUE",
]);

const EVENT_SEQUENCE_CODES = new Set<string>([
  ...Object.keys(EVENT_SEQUENCE_MESSAGES),
  "TIMESTAMP_NOT_MONOTONIC_WITH_SEQ_SORT_ORDER",
]);

/** Run-level issues are ingest/capture side; unknown codes still classify as workflow_execution (forward compat). */
export function failureDiagnosticForRunLevelCode(_code: string): FailureDiagnostic {
  return "workflow_execution";
}

export function failureDiagnosticForEventSequenceCode(code: string): FailureDiagnostic {
  if (!EVENT_SEQUENCE_CODES.has(code)) {
    throw new Error(`Unknown event-sequence reason code for failure diagnostic map: ${code}`);
  }
  return "workflow_execution";
}

function failureDiagnosticForIncompleteVerification(reasons: Reason[]): FailureDiagnostic {
  const C = new Set(reasons.map((r) => r.code));
  if (C.has("RETRY_OBSERVATIONS_DIVERGE")) return "workflow_execution";
  if (C.has("MULTI_EFFECT_INCOMPLETE")) return "verification_setup";
  if (C.has("UNKNOWN_TOOL")) return "verification_setup";
  for (const c of C) {
    if (RESOLVE_FAILURE_CODES.has(c)) return "verification_setup";
  }
  if (
    C.has("CONNECTOR_ERROR") ||
    C.has("ROW_SHAPE_MISMATCH") ||
    C.has("UNREADABLE_VALUE") ||
    C.has("RELATIONAL_SCALAR_UNUSABLE")
  ) {
    return "verification_setup";
  }
  throw new Error(
    `Unreachable incomplete_verification classification; add mapping for codes: ${[...C].sort().join(", ")}`,
  );
}

/**
 * Pinned product classification for non-verified steps. For `verified`, returns `undefined` (omit on wire).
 */
export function failureDiagnosticForStep(step: Pick<StepOutcome, "status" | "reasons">): FailureDiagnostic | undefined {
  const { status, reasons } = step;
  if (status === "verified") return undefined;
  if (status === "uncertain") return "observation_uncertainty";
  if (status === "missing" || status === "inconsistent" || status === "partially_verified") {
    return "workflow_execution";
  }
  if (status === "incomplete_verification") {
    return failureDiagnosticForIncompleteVerification(reasons);
  }
  const _exhaustive: never = status;
  return _exhaustive;
}

function sanitizeOneLine(value: string): string {
  const s = value.replace(/\r\n|\r|\n/g, " ").replace(/ +/g, " ").trim();
  return formatOperationalMessage(s);
}

function fieldNamesSorted(requiredFields: Record<string, unknown>): string {
  return Object.keys(requiredFields)
    .sort((a, b) => a.localeCompare(b))
    .join(", ");
}

/** One-line summary for human report; truncates like operational messages. */
export function formatVerificationTargetSummary(req: StepVerificationRequest): string | null {
  if (req === null) return null;
  if (typeof req !== "object" || !("kind" in req)) return null;
  if (req.kind === "sql_row") {
    const keys = fieldNamesSorted(req.requiredFields);
    const line = `table=${sanitizeOneLine(req.table)} ${req.keyColumn}=${sanitizeOneLine(req.keyValue)} required_fields=[${keys}]`;
    return formatOperationalMessage(line);
  }
  if (req.kind === "sql_relational") {
    const parts = [...req.checks]
      .sort((a, b) => compareUtf16Id(a.id, b.id))
      .map((c) => {
        if (c.checkKind === "related_exists" && c.whereEq.length > 0) {
          return `${c.id}:${sanitizeOneLine(c.checkKind)}:w${c.whereEq.length}`;
        }
        return `${c.id}:${sanitizeOneLine(c.checkKind)}`;
      });
    const line = `sql_relational count=${req.checks.length} ` + parts.join("; ");
    const max = OPERATIONAL_MESSAGE_MAX_CHARS;
    if (line.length <= max) return line;
    return `${line.slice(0, max - 3)}...`;
  }
  const parts = [...req.effects]
    .sort((a, b) => compareUtf16Id(a.id, b.id))
    .map((e) => `${e.id}:${sanitizeOneLine(e.table)}.${e.keyColumn}=${sanitizeOneLine(e.keyValue)}`);
  const line = `sql_effects count=${req.effects.length} ` + parts.join("; ");
  const max = OPERATIONAL_MESSAGE_MAX_CHARS;
  if (line.length <= max) return line;
  return `${line.slice(0, max - 3)}...`;
}

/**
 * Attach `failureDiagnostic` per schema v5: omitted when verified, required otherwise.
 */
export function withFailureDiagnostic(step: StepOutcome): StepOutcome {
  const fd = failureDiagnosticForStep(step);
  if (step.status === "verified") {
    const { failureDiagnostic: _omit, ...rest } = step;
    return rest as StepOutcome;
  }
  return { ...step, failureDiagnostic: fd! };
}

/** Strip and re-apply diagnostic (idempotent). */
export function enrichStepsWithFailureDiagnostics(steps: StepOutcome[]): StepOutcome[] {
  return steps.map((s) => withFailureDiagnostic(stripFailureDiagnostic(s)));
}

function stripFailureDiagnostic(step: StepOutcome): StepOutcome {
  const { failureDiagnostic: _o, ...rest } = step;
  return rest as StepOutcome;
}
