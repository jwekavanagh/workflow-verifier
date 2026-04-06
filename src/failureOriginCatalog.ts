/**
 * Single source of truth for code → FailureOrigin mappings.
 * FailureOrigin literals: generated `failureOriginTypes.generated.ts` (schema sync). Operational values: `operationalDisposition.ts`.
 */

import { CLI_OPERATIONAL_CODES, type OperationalCode } from "./cliOperationalCodes.js";
import { OPERATIONAL_DISPOSITION } from "./operationalDisposition.js";
import type { FailureOrigin } from "./failureOriginTypes.js";
import { RESOLVE_FAILURE_CODES } from "./resolveFailureCodes.js";
import { SQL_VERIFICATION_OUTCOME_CODE } from "./wireReasonCodes.js";

export type { FailureOrigin } from "./failureOriginTypes.js";
export { FAILURE_ORIGINS } from "./failureOriginTypes.js";

/** Sentinel for steps with empty reasons (should not occur in production). */
export const STEP_NO_REASON_CODE = "STEP_NO_REASON" as const;

/** Test-only reason from aggregate tests; not emitted by verification pipeline. */
export const TEST_BLOCKING_CODE = "TEST_BLOCKING_CODE" as const;

const DOWNSTREAM = "downstream_system_state" as const satisfies FailureOrigin;
const INPUTS = "inputs" as const satisfies FailureOrigin;
const TOOL_USE = "tool_use" as const satisfies FailureOrigin;
const WORKFLOW_FLOW = "workflow_flow" as const satisfies FailureOrigin;

/**
 * Step-level verification reason codes → primary FailureOrigin (before P5b effect override).
 * Every production-emitted step reason code must appear here.
 */
export const REASON_CODE_TO_ORIGIN: Record<string, FailureOrigin> = {
  [STEP_NO_REASON_CODE]: WORKFLOW_FLOW,
  [TEST_BLOCKING_CODE]: WORKFLOW_FLOW,

  [SQL_VERIFICATION_OUTCOME_CODE.ROW_ABSENT]: DOWNSTREAM,
  [SQL_VERIFICATION_OUTCOME_CODE.DUPLICATE_ROWS]: DOWNSTREAM,
  [SQL_VERIFICATION_OUTCOME_CODE.VALUE_MISMATCH]: DOWNSTREAM,
  [SQL_VERIFICATION_OUTCOME_CODE.ROW_NOT_OBSERVED_WITHIN_WINDOW]: DOWNSTREAM,
  [SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_UNCERTAIN_WITHIN_WINDOW]: DOWNSTREAM,

  [SQL_VERIFICATION_OUTCOME_CODE.CONNECTOR_ERROR]: DOWNSTREAM,
  [SQL_VERIFICATION_OUTCOME_CODE.ROW_SHAPE_MISMATCH]: DOWNSTREAM,
  [SQL_VERIFICATION_OUTCOME_CODE.UNREADABLE_VALUE]: DOWNSTREAM,

  [SQL_VERIFICATION_OUTCOME_CODE.UNKNOWN_TOOL]: TOOL_USE,
  [SQL_VERIFICATION_OUTCOME_CODE.RETRY_OBSERVATIONS_DIVERGE]: TOOL_USE,

  [SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_PARTIAL]: DOWNSTREAM,
  [SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_ALL_FAILED]: DOWNSTREAM,
  [SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_INCOMPLETE]: DOWNSTREAM,

  PLAN_RULE_ROW_KIND_MISMATCH: WORKFLOW_FLOW,
  PLAN_RULE_FORBIDDEN_ROW: WORKFLOW_FLOW,
  PLAN_RULE_REQUIRED_ROW_MISSING: WORKFLOW_FLOW,
  PLAN_RULE_ALLOWLIST_VIOLATION: WORKFLOW_FLOW,
  PLAN_RULE_RENAME_MISMATCH: WORKFLOW_FLOW,

  ...Object.fromEntries([...RESOLVE_FAILURE_CODES].map((c) => [c, INPUTS])) as Record<string, FailureOrigin>,
};

export const RUN_LEVEL_CODE_TO_ORIGIN: Record<string, FailureOrigin> = {
  MALFORMED_EVENT_LINE: INPUTS,
  NO_STEPS_FOR_WORKFLOW: WORKFLOW_FLOW,
  [TEST_BLOCKING_CODE]: WORKFLOW_FLOW,
};

export const EVENT_SEQUENCE_CODE_TO_ORIGIN: Record<string, FailureOrigin> = {
  CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ: WORKFLOW_FLOW,
  TIMESTAMP_NOT_MONOTONIC_WITH_SEQ_SORT_ORDER: WORKFLOW_FLOW,
};

function operationalMaps(): {
  origin: Record<OperationalCode, FailureOrigin>;
  summary: Record<OperationalCode, string>;
} {
  const origin = {} as Record<OperationalCode, FailureOrigin>;
  const summary = {} as Record<OperationalCode, string>;
  for (const code of Object.values(CLI_OPERATIONAL_CODES) as OperationalCode[]) {
    const row = OPERATIONAL_DISPOSITION[code];
    origin[code] = row.origin;
    summary[code] = row.summary;
  }
  return { origin, summary };
}

const _op = operationalMaps();

/** Every CLI_OPERATIONAL_CODES value → FailureOrigin. */
export const OPERATIONAL_CODE_TO_ORIGIN: Record<OperationalCode, FailureOrigin> = _op.origin;

/** Short operational diagnosis summaries (single line, truncation-safe). */
export const OPERATIONAL_CODE_TO_SUMMARY: Record<OperationalCode, string> = _op.summary;

export function originForStepReasonCode(code: string): FailureOrigin {
  const o = REASON_CODE_TO_ORIGIN[code];
  if (o === undefined) {
    throw new Error(`REASON_CODE_TO_ORIGIN missing required code: ${code}`);
  }
  return o;
}

export function originForRunLevelCode(code: string): FailureOrigin {
  const o = RUN_LEVEL_CODE_TO_ORIGIN[code];
  if (o === undefined) {
    throw new Error(`RUN_LEVEL_CODE_TO_ORIGIN missing required code: ${code}`);
  }
  return o;
}

export function originForEventSequenceCode(code: string): FailureOrigin {
  const o = EVENT_SEQUENCE_CODE_TO_ORIGIN[code];
  if (o === undefined) {
    throw new Error(`EVENT_SEQUENCE_CODE_TO_ORIGIN missing required code: ${code}`);
  }
  return o;
}

export function originForOperationalCode(code: string): FailureOrigin {
  if (!(code in OPERATIONAL_CODE_TO_ORIGIN)) {
    throw new Error(`OPERATIONAL_CODE_TO_ORIGIN missing required code: ${code}`);
  }
  return OPERATIONAL_CODE_TO_ORIGIN[code as OperationalCode];
}

/** Union of every production step reason code the exhaustiveness test must cover. */
export const PRODUCTION_STEP_REASON_CODES: ReadonlySet<string> = new Set([
  ...Object.keys(REASON_CODE_TO_ORIGIN).filter(
    (c) => c !== STEP_NO_REASON_CODE && c !== TEST_BLOCKING_CODE,
  ),
]);
