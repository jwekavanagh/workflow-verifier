import type { Reason } from "./types.js";

/** CLI operational error envelope (stderr, exit 3). */
export const CLI_ERROR_SCHEMA_VERSION = 1 as const;
export const CLI_ERROR_KIND = "execution_truth_layer_error" as const;

export const OPERATIONAL_MESSAGE_MAX_CHARS = 2048;

/** Every operational exit-3 code (SSOT for integrators). */
export const CLI_OPERATIONAL_CODES = {
  CLI_USAGE: "CLI_USAGE",
  REGISTRY_READ_FAILED: "REGISTRY_READ_FAILED",
  REGISTRY_JSON_SYNTAX: "REGISTRY_JSON_SYNTAX",
  REGISTRY_SCHEMA_INVALID: "REGISTRY_SCHEMA_INVALID",
  REGISTRY_DUPLICATE_TOOL_ID: "REGISTRY_DUPLICATE_TOOL_ID",
  EVENTS_READ_FAILED: "EVENTS_READ_FAILED",
  SQLITE_DATABASE_OPEN_FAILED: "SQLITE_DATABASE_OPEN_FAILED",
  POSTGRES_CLIENT_SETUP_FAILED: "POSTGRES_CLIENT_SETUP_FAILED",
  WORKFLOW_RESULT_SCHEMA_INVALID: "WORKFLOW_RESULT_SCHEMA_INVALID",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  COMPARE_USAGE: "COMPARE_USAGE",
  COMPARE_INSUFFICIENT_RUNS: "COMPARE_INSUFFICIENT_RUNS",
  COMPARE_WORKFLOW_ID_MISMATCH: "COMPARE_WORKFLOW_ID_MISMATCH",
  COMPARE_INPUT_READ_FAILED: "COMPARE_INPUT_READ_FAILED",
  COMPARE_INPUT_JSON_SYNTAX: "COMPARE_INPUT_JSON_SYNTAX",
  COMPARE_INPUT_SCHEMA_INVALID: "COMPARE_INPUT_SCHEMA_INVALID",
  /** v6 compare input: embedded `workflowTruthReport` disagrees with `buildWorkflowTruthReport(engine)`. */
  COMPARE_WORKFLOW_TRUTH_MISMATCH: "COMPARE_WORKFLOW_TRUTH_MISMATCH",
  COMPARE_RUN_COMPARISON_REPORT_INVALID: "COMPARE_RUN_COMPARISON_REPORT_INVALID",
  VERIFICATION_POLICY_INVALID: "VERIFICATION_POLICY_INVALID",
  EVENTUAL_MODE_NOT_SUPPORTED_IN_PROCESS_HOOK: "EVENTUAL_MODE_NOT_SUPPORTED_IN_PROCESS_HOOK",
  /** Registry validation CLI / `validateToolsRegistry` usage (see SSOT section Registry validation). */
  VALIDATE_REGISTRY_USAGE: "VALIDATE_REGISTRY_USAGE",
} as const;

/** Same literal as step `incomplete_verification` for divergent retries (SSOT + registry validation). */
export const RETRY_OBSERVATIONS_DIVERGE_MESSAGE =
  "Multiple observations for this seq do not all match the last observation (toolId and canonical params).";

export type OperationalCode = (typeof CLI_OPERATIONAL_CODES)[keyof typeof CLI_OPERATIONAL_CODES];

export const RUN_LEVEL_MESSAGES = {
  MALFORMED_EVENT_LINE:
    "Event line was missing, invalid JSON, or failed schema validation for a tool observation.",
  NO_STEPS_FOR_WORKFLOW: "No tool_observed events for this workflow id after filtering.",
} as const;

export function runLevelIssue(code: keyof typeof RUN_LEVEL_MESSAGES): Reason {
  return { code, message: RUN_LEVEL_MESSAGES[code] };
}

/** SSOT for WorkflowResult.eventSequenceIntegrity.reasons (machine codes + messages). */
export const EVENT_SEQUENCE_MESSAGES = {
  CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ:
    "Capture order was not non-decreasing in seq; planning and verification used seq-sorted order, not arrival order.",
} as const;

export type EventSequenceIssueCode = keyof typeof EVENT_SEQUENCE_MESSAGES;

export function eventSequenceIssue(code: EventSequenceIssueCode): Reason {
  return { code, message: EVENT_SEQUENCE_MESSAGES[code] };
}

const TIMESTAMP_NOT_MONOTONIC_CODE = "TIMESTAMP_NOT_MONOTONIC_WITH_SEQ_SORT_ORDER" as const;

/** First adjacent pair in seq-sorted order with decreasing parsed timestamps (seq values from those events). */
export function eventSequenceTimestampNotMonotonicReason(seqBefore: number, seqAfter: number): Reason {
  return {
    code: TIMESTAMP_NOT_MONOTONIC_CODE,
    message: `In seq-sorted order, timestamp decreased between seq ${seqBefore} and seq ${seqAfter}.`,
  };
}

export function formatOperationalMessage(raw: string): string {
  let s = raw.replace(/\t|\r|\n/g, " ");
  s = s.replace(/ +/g, " ").trim();
  const max = OPERATIONAL_MESSAGE_MAX_CHARS;
  if (s.length > max) {
    return `${s.slice(0, max - 3)}...`;
  }
  return s;
}

export function cliErrorEnvelope(code: string, message: string): string {
  return JSON.stringify({
    schemaVersion: CLI_ERROR_SCHEMA_VERSION,
    kind: CLI_ERROR_KIND,
    code,
    message: formatOperationalMessage(message),
  });
}
