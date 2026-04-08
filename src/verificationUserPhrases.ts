/**
 * User-facing phrases for stable machine reason codes (Quick human output + workflow truth report user_meaning).
 * Ingest banner strings remain in quickVerifyHumanCopy.ts per normative Appendix H.
 */

import { EVENT_SEQUENCE_MESSAGES, RUN_LEVEL_MESSAGES } from "./failureCatalog.js";
import {
  REGISTRY_RESOLVER_CODE,
  SQL_VERIFICATION_OUTCOME_CODE,
} from "./wireReasonCodes.js";

const TIMESTAMP_NOT_MONOTONIC_CODE = "TIMESTAMP_NOT_MONOTONIC_WITH_SEQ_SORT_ORDER" as const;

/** Reconciler / SQL outcome codes — user-oriented wording. */
export const SQL_VERIFICATION_PHRASES: Record<
  (typeof SQL_VERIFICATION_OUTCOME_CODE)[keyof typeof SQL_VERIFICATION_OUTCOME_CODE],
  string
> = {
  ROW_ABSENT: "Success was implied, but no matching row was found in the database.",
  DUPLICATE_ROWS: "Duplicate or conflicting rows matched the same key.",
  ROW_SHAPE_MISMATCH: "The row’s shape or columns did not match what verification expected.",
  UNREADABLE_VALUE: "A stored value could not be read or compared reliably.",
  VALUE_MISMATCH: "Wrong value in the database for a required field.",
  CONNECTOR_ERROR: "Database query failed during verification.",
  MULTI_EFFECT_INCOMPLETE: "Not all intended effects for this step could be verified.",
  MULTI_EFFECT_ALL_FAILED: "All intended effects for this step failed verification.",
  MULTI_EFFECT_PARTIAL: "Some intended effects matched; others did not.",
  ROW_NOT_OBSERVED_WITHIN_WINDOW: "The expected row did not show up within the verification window.",
  MULTI_EFFECT_UNCERTAIN_WITHIN_WINDOW: "Effects could not be fully confirmed within the verification window.",
  UNKNOWN_TOOL: "The tool is not defined in the registry (or could not be resolved).",
  RETRY_OBSERVATIONS_DIVERGE: "Multiple observations for this sequence do not agree.",
  RELATED_ROWS_ABSENT: "A related row required by the check is missing.",
  RELATIONAL_EXPECTATION_MISMATCH: "A relational check did not match the database.",
  RELATIONAL_SCALAR_UNUSABLE: "A relational scalar value could not be used for comparison.",
  ROW_PRESENT_WHEN_FORBIDDEN: "A row is still present when verification expected it to be gone.",
  ORPHAN_ROW_DETECTED: "An orphan or unexpected related row was detected.",
  FORBIDDEN_ROWS_STILL_PRESENT_WITHIN_WINDOW:
    "Rows that should have been removed were still present within the verification window.",
};

/** Registry resolver failures — short explanations for operators. */
export const REGISTRY_RESOLVER_PHRASES: Record<
  (typeof REGISTRY_RESOLVER_CODE)[keyof typeof REGISTRY_RESOLVER_CODE],
  string
> = {
  CONST_STRING_EMPTY: "Registry constant string is empty.",
  STRING_SPEC_POINTER_MISSING: "Registry string spec is missing a JSON Pointer path.",
  STRING_SPEC_TYPE: "Registry string spec has an invalid type.",
  STRING_SPEC_EMPTY: "Registry string spec resolved to an empty value.",
  KEY_VALUE_POINTER_MISSING: "Registry key/value spec is missing a pointer.",
  KEY_VALUE_NOT_SCALAR: "Registry key/value pointer did not resolve to a scalar.",
  KEY_VALUE_SPEC_INVALID: "Registry key/value spec is invalid.",
  TABLE_POINTER_INVALID: "Registry table pointer is invalid.",
  TABLE_SPEC_INVALID: "Registry table spec is invalid.",
  INVALID_IDENTIFIER: "Registry contains an invalid SQL identifier.",
  REQUIRED_FIELDS_POINTER_MISSING: "Registry required-fields pointer is missing.",
  REQUIRED_FIELDS_NOT_OBJECT: "Registry required-fields did not resolve to an object.",
  REQUIRED_FIELDS_VALUE_UNDEFINED: "A required field value is undefined in the registry.",
  REQUIRED_FIELDS_VALUE_NOT_SCALAR: "A required field value is not a scalar.",
  UNSUPPORTED_VERIFICATION_KIND: "This verification kind is not supported for the tool.",
  DUPLICATE_EFFECT_ID: "Duplicate effect id in the registry.",
  RELATIONAL_EXPECT_VALUE_INVALID: "Relational expectation value in the registry is invalid.",
  RELATIONAL_SUM_COLUMN_REQUIRED: "Relational sum check requires a column in the registry.",
  EQUALITY_DUPLICATE_COLUMN: "Duplicate column in an equality spec.",
  FILTER_EQ_OVERLAPS_IDENTITY: "Filter equality overlaps identity columns.",
};

/** Ingest / quick misc (not SQL or registry resolver). */
export const INGEST_AND_QUICK_MISC_PHRASES = {
  INGEST_NO_ACTIONS:
    "No tool calls detected in input. This tool only ingests structured tool activity (JSON with tool names and parameters)—not arbitrary logs.",
  INGEST_NO_STRUCTURED_TOOL_ACTIVITY:
    "No structured tool activity was found. Input must be JSON/NDJSON describing tool calls and parameters that match the ingest model (see docs)—not generic log lines.",
  INGEST_INPUT_TOO_LARGE: "Input exceeded the maximum allowed size.",
  INGEST_ACTION_CAP: "Action limit reached; extra tool calls were ignored.",
  MALFORMED_LINE: "One or more lines could not be parsed as JSON.",
} as const;

/** Run-context codes referenced by `failureAnalysis` P1–P3 (failure explanation divergence lines). */
export const RUN_CONTEXT_FAILURE_PHRASES: Record<string, string> = {
  RETRIEVAL_ERROR: "A retrieval step failed before the failing tool observation.",
  MODEL_TURN_ERROR: "A model turn reported an error before the failing tool observation.",
  MODEL_TURN_ABORTED: "A model turn was aborted before the failing tool observation.",
  MODEL_TURN_INCOMPLETE: "A model turn was incomplete before the failing tool observation.",
  CONTROL_INTERRUPT: "An interrupt control event occurred before the failing tool observation.",
  CONTROL_BRANCH_SKIPPED: "A branch was skipped before the failing tool observation.",
  CONTROL_GATE_SKIPPED: "A gate was skipped before the failing tool observation.",
  TOOL_SKIPPED: "A tool was skipped before the failing tool observation.",
};

const RUN_AND_EVENT_PHRASES: Record<string, string> = {
  ...RUN_LEVEL_MESSAGES,
  ...EVENT_SEQUENCE_MESSAGES,
  ...RUN_CONTEXT_FAILURE_PHRASES,
  [TIMESTAMP_NOT_MONOTONIC_CODE]:
    "Timestamps decreased between steps in sequence order (ordering may be unreliable).",
};

const FALLBACK_PREFIX = "Verification issue (code " as const;

export function userPhraseForReasonCode(code: string): string {
  if (Object.prototype.hasOwnProperty.call(SQL_VERIFICATION_PHRASES, code)) {
    return SQL_VERIFICATION_PHRASES[code as keyof typeof SQL_VERIFICATION_PHRASES];
  }
  if (Object.prototype.hasOwnProperty.call(REGISTRY_RESOLVER_PHRASES, code)) {
    return REGISTRY_RESOLVER_PHRASES[code as keyof typeof REGISTRY_RESOLVER_PHRASES];
  }
  if (Object.prototype.hasOwnProperty.call(INGEST_AND_QUICK_MISC_PHRASES, code)) {
    return INGEST_AND_QUICK_MISC_PHRASES[code as keyof typeof INGEST_AND_QUICK_MISC_PHRASES];
  }
  if (Object.prototype.hasOwnProperty.call(RUN_AND_EVENT_PHRASES, code)) {
    return RUN_AND_EVENT_PHRASES[code]!;
  }
  if (code.startsWith("MAPPING_")) {
    return `Mapping: ${code.slice("MAPPING_".length).toLowerCase().replace(/_/g, " ")}.`;
  }
  return `${FALLBACK_PREFIX}${code}).`;
}

export function isFallbackUserPhrase(phrase: string): boolean {
  return phrase.startsWith(FALLBACK_PREFIX);
}
