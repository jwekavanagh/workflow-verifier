/**
 * Single source for reconciliation dimension IDs, human titles, stderr prefixes,
 * batch observed-state summaries, and Quick Verify unit reconciliation objects.
 */
import { formatOperationalMessage } from "./failureCatalog.js";
import { formatVerificationTargetSummary } from "./verificationDiagnostics.js";
import type { ResolvedRelationalCheck, StepOutcome, VerificationRequest } from "./types.js";
import { stableStringify } from "./quickVerify/canonicalJson.js";

/** Stable dimension IDs: JSON keys, data-etl-dimension, and logical identity. */
export const RECONCILIATION_DIMENSION_DECLARED = "declared" as const;
export const RECONCILIATION_DIMENSION_EXPECTED = "expected" as const;
export const RECONCILIATION_DIMENSION_OBSERVED_DATABASE = "observed_database" as const;
export const RECONCILIATION_DIMENSION_VERIFICATION_VERDICT = "verification_verdict" as const;

/** HTML <th> text (exact). */
export const RECONCILIATION_TITLE_DECLARED = "Declared";
export const RECONCILIATION_TITLE_EXPECTED = "Expected";
export const RECONCILIATION_TITLE_OBSERVED_DATABASE = "Observed (database)";
export const RECONCILIATION_TITLE_VERIFICATION_VERDICT = "Verification verdict";

/** Stderr / human line prefixes (exact, including trailing space). */
export const LINE_PREFIX_DECLARED = "declared: ";
export const LINE_PREFIX_EXPECTED = "expected: ";
export const LINE_PREFIX_OBSERVED_DATABASE = "observed_database: ";
export const LINE_PREFIX_VERIFICATION_VERDICT = "verification_verdict: ";

export const EXPECTED_NONE_NO_SQL = "(none — no resolvable SQL expectation)";

export const QUICK_OBSERVED_MAPPING_FAILED = "No database observation (verification not run).";
export const QUICK_OBSERVED_CONNECTOR_EMPTY = "No database observation recorded (query did not return evidence).";
export const QUICK_OBSERVED_CONNECTOR_ERROR = "Connector error (no observation payload).";
export const QUICK_RELATED_EXISTS_PRESENT = "Related-exists scalar: present (1).";
export const QUICK_RELATED_EXISTS_ABSENT = "Related-exists scalar: absent (0).";
export const QUICK_RELATED_EXISTS_UNUSABLE = "Related-exists scalar: unusable.";

function formatPlanTransitionEvidenceSummary(ev: Record<string, unknown>): string {
  const { planTransition: _pt, ...rest } = ev;
  const json = JSON.stringify(rest);
  const max = 500;
  return json.length <= max ? json : `${json.slice(0, max - 3)}...`;
}

/**
 * Batch observed database/git evidence summary for truth JSON and trust UI.
 * Ported from legacy trust-panel logic; result is operational-message normalized.
 */
export function formatBatchObservedStateSummary(step: StepOutcome): string {
  let raw: string;
  if (step.evidenceSummary && (step.evidenceSummary as { planTransition?: boolean }).planTransition === true) {
    raw = formatPlanTransitionEvidenceSummary(step.evidenceSummary as Record<string, unknown>);
  } else if (step.verificationRequest === null) {
    raw = "No SQL verification request (registry resolution or unknown tool).";
  } else {
    const ev = step.evidenceSummary ?? {};
    if (step.verificationRequest.kind === "sql_effects") {
      const effects = Array.isArray(ev.effects) ? ev.effects.length : (ev.effectCount as number | undefined) ?? 0;
      raw = `multi_effect effect_rows=${effects}`;
    } else if (step.verificationRequest.kind === "sql_relational") {
      if (step.verificationRequest.checks.length >= 2) {
        const effects = Array.isArray(ev.effects) ? ev.effects.length : (ev.effectCount as number | undefined) ?? 0;
        raw = `multi_effect effect_rows=${effects}`;
      } else {
        const ck = ev.checkKind;
        const cid = ev.checkId;
        if (typeof ck === "string" && typeof cid === "string") {
          raw = `sql_relational check=${cid} kind=${ck}`;
        } else {
          raw = "sql_relational (single check)";
        }
      }
    } else {
      const rowCount = ev.rowCount;
      if (typeof rowCount === "number") {
        if (ev.field !== undefined && ev.expected !== undefined && ev.actual !== undefined) {
          raw = `rowCount=${rowCount} field=${String(ev.field)} expected=${String(ev.expected)} actual=${String(
            ev.actual,
          )}`;
        } else {
          raw = `rowCount=${rowCount}`;
        }
      } else {
        raw = "SQL evidence present (no rowCount in summary).";
      }
    }
  }
  return formatOperationalMessage(raw);
}

/** Format quick row verification object like batch row evidence (read-only summary). */
export function formatQuickRowObservedDatabase(verification: Record<string, unknown>): string {
  const rowCount = verification.rowCount;
  if (typeof rowCount === "number") {
    const field = verification.field;
    const expected = verification.expected;
    const actual = verification.actual;
    if (field !== undefined && expected !== undefined && actual !== undefined) {
      return formatOperationalMessage(
        `rowCount=${rowCount} field=${String(field)} expected=${String(expected)} actual=${String(actual)}`,
      );
    }
    return formatOperationalMessage(`rowCount=${rowCount}`);
  }
  if (Object.keys(verification).length === 0) {
    return QUICK_OBSERVED_CONNECTOR_EMPTY;
  }
  return formatOperationalMessage(`SQL evidence keys=${Object.keys(verification).sort().join(",")}`);
}

function formatConfidence(c: number): string {
  const s = c.toFixed(3);
  return s.replace(/\.?0+$/, "") || "0";
}

export type QuickUnitReconciliationInput =
  | {
      kind: "row_mapping_failed";
      toolName: string;
      actionIndex: number;
      flat: Record<string, unknown>;
      confidence: number;
    }
  | {
      kind: "row_verified";
      toolName: string;
      actionIndex: number;
      flat: Record<string, unknown>;
      table: string;
      request: VerificationRequest;
      verification: Record<string, unknown>;
      verdict: "verified";
      confidence: number;
    }
  | {
      kind: "row_fail_or_uncertain";
      toolName: string;
      actionIndex: number;
      flat: Record<string, unknown>;
      table: string;
      request: VerificationRequest;
      verification: Record<string, unknown>;
      verdict: "fail" | "uncertain";
      reasonCodes: string[];
      confidence: number;
    }
  | {
      kind: "related_exists";
      toolName: string;
      actionIndex: number;
      flat: Record<string, unknown>;
      check: ResolvedRelationalCheck & { checkKind: "related_exists" };
      verdict: "verified" | "fail" | "uncertain";
      reasonCodes: string[];
      confidence: number;
    };

export type QuickUnitReconciliation = {
  declared: string;
  expected: string;
  observed_database: string;
  verification_verdict: string;
};

function declaredLine(toolName: string, actionIndex: number, flat: Record<string, unknown>): string {
  const raw = `tool=${toolName}; action#=${actionIndex}; parameters_digest=${stableStringify(flat)}`;
  return formatOperationalMessage(raw);
}

export function buildQuickUnitReconciliation(input: QuickUnitReconciliationInput): QuickUnitReconciliation {
  const { toolName, actionIndex, flat } = input;
  const declared = declaredLine(toolName, actionIndex, flat);
  const confStr = formatConfidence(input.confidence);

  if (input.kind === "row_mapping_failed") {
    return {
      declared,
      expected: EXPECTED_NONE_NO_SQL,
      observed_database: QUICK_OBSERVED_MAPPING_FAILED,
      verification_verdict: formatOperationalMessage(`outcome=uncertain; confidence=${confStr}`),
    };
  }

  if (input.kind === "related_exists") {
    const expected = formatOperationalMessage(`related_exists; id=${input.check.id}`);
    let observed: string;
    if (input.reasonCodes.includes("CONNECTOR_ERROR")) {
      observed = QUICK_OBSERVED_CONNECTOR_ERROR;
    } else if (input.reasonCodes.includes("RELATIONAL_SCALAR_UNUSABLE")) {
      observed = QUICK_RELATED_EXISTS_UNUSABLE;
    } else if (input.verdict === "verified") {
      observed = QUICK_RELATED_EXISTS_PRESENT;
    } else if (input.verdict === "fail") {
      observed = QUICK_RELATED_EXISTS_ABSENT;
    } else {
      observed = QUICK_RELATED_EXISTS_UNUSABLE;
    }
    return {
      declared,
      expected,
      observed_database: observed,
      verification_verdict: formatOperationalMessage(`outcome=${input.verdict}; confidence=${confStr}`),
    };
  }

  const expectedSummary = formatVerificationTargetSummary(input.request);
  const expected =
    expectedSummary === null
      ? EXPECTED_NONE_NO_SQL
      : formatOperationalMessage(`table=${input.table}; ${expectedSummary}`);

  let observed_database: string;
  if (input.kind === "row_fail_or_uncertain") {
    if (Object.keys(input.verification).length === 0 && input.reasonCodes.includes("CONNECTOR_ERROR")) {
      observed_database = QUICK_OBSERVED_CONNECTOR_ERROR;
    } else {
      observed_database = formatQuickRowObservedDatabase(input.verification);
    }
  } else {
    observed_database = formatQuickRowObservedDatabase(input.verification);
  }

  return {
    declared,
    expected,
    observed_database,
    verification_verdict: formatOperationalMessage(`outcome=${input.verdict}; confidence=${confStr}`),
  };
}

/** Batch stderr `declared:` value (single operational line). */
export function formatBatchDeclaredStderrValue(
  toolId: string,
  intentNarrative: string,
  paramsCanonical: string,
): string {
  const intent =
    intentNarrative.trim().length === 0
      ? "(none)"
      : intentNarrative.replace(/\t|\r|\n/g, " ").replace(/ +/g, " ").trim();
  const raw = `tool=${toolId}; intent=${intent}; parameters_digest=${paramsCanonical}`;
  return formatOperationalMessage(raw);
}

/** Batch stderr `expected:` value. */
export function formatBatchExpectedStderrValue(verifyTarget: string | null): string {
  if (verifyTarget === null || verifyTarget === "") {
    return EXPECTED_NONE_NO_SQL;
  }
  return formatOperationalMessage(verifyTarget);
}

/** Batch stderr `verification_verdict:` value. */
export function formatBatchVerificationVerdictStderrValue(
  outcomeLabel: string,
  humanPhrase: string,
  failureCategory?: string,
): string {
  let raw = `outcome=${outcomeLabel}; ${humanPhrase}`;
  if (failureCategory !== undefined && failureCategory.length > 0) {
    raw += `; failure_category=${failureCategory}`;
  }
  return formatOperationalMessage(raw);
}
