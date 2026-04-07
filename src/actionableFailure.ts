/**
 * Normative actionable failure classification (P-CAT-1–4, workflow S-1–S4, operational severity).
 * Pair with JSON Schema enums on workflowTruthReport / cli-error-envelope / run-comparison-report.
 */

import { CLI_OPERATIONAL_CODES, type OperationalCode } from "./cliOperationalCodes.js";
import {
  REASON_CODE_TO_ORIGIN,
  RUN_LEVEL_CODE_TO_ORIGIN,
  STEP_NO_REASON_CODE,
  TEST_BLOCKING_CODE,
} from "./failureOriginCatalog.js";
import { OPERATIONAL_DISPOSITION } from "./operationalDisposition.js";
import { REGISTRY_RESOLVER_CODE, SQL_VERIFICATION_OUTCOME_CODE } from "./wireReasonCodes.js";
import type {
  ActionableFailure,
  ActionableFailureCategory,
  ActionableFailureSeverity,
  FailureAnalysisBase,
  RecommendedActionCode,
  WorkflowEngineResult,
} from "./types.js";

export const ACTIONABLE_FAILURE_CATEGORIES = [
  "decision_error",
  "bad_input",
  "retrieval_failure",
  "control_flow_problem",
  "state_inconsistency",
  "downstream_execution_failure",
  "ambiguous",
  "unclassified",
] as const satisfies readonly ActionableFailureCategory[];

export const ACTIONABLE_FAILURE_SEVERITIES = ["high", "medium", "low"] as const satisfies readonly ActionableFailureSeverity[];

type RemediationRow = { recommendedAction: RecommendedActionCode; automationSafe: boolean };

const MANUAL_REMEDIATION: RemediationRow = { recommendedAction: "manual_review", automationSafe: false };

const RUN_LEVEL_TO_CATEGORY: Record<string, ActionableFailureCategory> = {
  MALFORMED_EVENT_LINE: "bad_input",
  NO_STEPS_FOR_WORKFLOW: "control_flow_problem",
};

const EVENT_SEQUENCE_TO_CATEGORY: Record<string, ActionableFailureCategory> = {
  CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ: "control_flow_problem",
  TIMESTAMP_NOT_MONOTONIC_WITH_SEQ_SORT_ORDER: "control_flow_problem",
};

const RUN_CONTEXT_CODE_TO_CATEGORY: Record<string, ActionableFailureCategory> = {
  RETRIEVAL_ERROR: "retrieval_failure",
  MODEL_TURN_ERROR: "decision_error",
  MODEL_TURN_ABORTED: "decision_error",
  MODEL_TURN_INCOMPLETE: "decision_error",
  CONTROL_INTERRUPT: "decision_error",
  CONTROL_BRANCH_SKIPPED: "control_flow_problem",
  CONTROL_GATE_SKIPPED: "control_flow_problem",
  TOOL_SKIPPED: "control_flow_problem",
};

export const RUN_LEVEL_CODE_TO_REMEDIATION: Record<string, RemediationRow> = {
  MALFORMED_EVENT_LINE: { recommendedAction: "fix_event_ingest_and_steps", automationSafe: false },
  NO_STEPS_FOR_WORKFLOW: { recommendedAction: "fix_event_ingest_and_steps", automationSafe: false },
  [TEST_BLOCKING_CODE]: { recommendedAction: "fix_event_ingest_and_steps", automationSafe: false },
};

export const EVENT_SEQUENCE_CODE_TO_REMEDIATION: Record<string, RemediationRow> = {
  CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ: { recommendedAction: "fix_event_sequence_order", automationSafe: false },
  TIMESTAMP_NOT_MONOTONIC_WITH_SEQ_SORT_ORDER: { recommendedAction: "fix_event_sequence_order", automationSafe: false },
};

export const RUN_CONTEXT_CODE_TO_REMEDIATION: Record<string, RemediationRow> = {
  RETRIEVAL_ERROR: { recommendedAction: "fix_run_context_controls", automationSafe: false },
  MODEL_TURN_ERROR: { recommendedAction: "fix_run_context_controls", automationSafe: false },
  MODEL_TURN_ABORTED: { recommendedAction: "fix_run_context_controls", automationSafe: false },
  MODEL_TURN_INCOMPLETE: { recommendedAction: "fix_run_context_controls", automationSafe: false },
  CONTROL_INTERRUPT: { recommendedAction: "fix_run_context_controls", automationSafe: false },
  CONTROL_BRANCH_SKIPPED: { recommendedAction: "fix_run_context_controls", automationSafe: false },
  CONTROL_GATE_SKIPPED: { recommendedAction: "fix_run_context_controls", automationSafe: false },
  TOOL_SKIPPED: { recommendedAction: "fix_run_context_controls", automationSafe: false },
};

/** Production step primary reason codes only — never run-level codes (`RUN_LEVEL_CODE_TO_ORIGIN` minus overlaps like `TEST_BLOCKING_CODE`). */
const STEP_CODE_TO_CATEGORY: Record<string, ActionableFailureCategory> = {
  [SQL_VERIFICATION_OUTCOME_CODE.RETRY_OBSERVATIONS_DIVERGE]: "decision_error",
  [SQL_VERIFICATION_OUTCOME_CODE.UNKNOWN_TOOL]: "bad_input",
  [SQL_VERIFICATION_OUTCOME_CODE.ROW_ABSENT]: "state_inconsistency",
  [SQL_VERIFICATION_OUTCOME_CODE.RELATED_ROWS_ABSENT]: "state_inconsistency",
  [SQL_VERIFICATION_OUTCOME_CODE.RELATIONAL_EXPECTATION_MISMATCH]: "state_inconsistency",
  [SQL_VERIFICATION_OUTCOME_CODE.RELATIONAL_SCALAR_UNUSABLE]: "downstream_execution_failure",
  [SQL_VERIFICATION_OUTCOME_CODE.VALUE_MISMATCH]: "state_inconsistency",
  [SQL_VERIFICATION_OUTCOME_CODE.DUPLICATE_ROWS]: "state_inconsistency",
  [SQL_VERIFICATION_OUTCOME_CODE.ROW_NOT_OBSERVED_WITHIN_WINDOW]: "downstream_execution_failure",
  [SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_UNCERTAIN_WITHIN_WINDOW]: "downstream_execution_failure",
  [SQL_VERIFICATION_OUTCOME_CODE.CONNECTOR_ERROR]: "downstream_execution_failure",
  [SQL_VERIFICATION_OUTCOME_CODE.ROW_SHAPE_MISMATCH]: "downstream_execution_failure",
  [SQL_VERIFICATION_OUTCOME_CODE.UNREADABLE_VALUE]: "downstream_execution_failure",
  [SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_PARTIAL]: "downstream_execution_failure",
  [SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_ALL_FAILED]: "downstream_execution_failure",
  [SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_INCOMPLETE]: "bad_input",
  [STEP_NO_REASON_CODE]: "control_flow_problem",
  [TEST_BLOCKING_CODE]: "control_flow_problem",

  PLAN_RULE_ROW_KIND_MISMATCH: "state_inconsistency",
  PLAN_RULE_FORBIDDEN_ROW: "state_inconsistency",
  PLAN_RULE_REQUIRED_ROW_MISSING: "state_inconsistency",
  PLAN_RULE_ALLOWLIST_VIOLATION: "state_inconsistency",
  PLAN_RULE_RENAME_MISMATCH: "state_inconsistency",
};

const STEP_CODE_TO_REMEDIATION: Record<string, RemediationRow> = {
  [SQL_VERIFICATION_OUTCOME_CODE.RETRY_OBSERVATIONS_DIVERGE]: {
    recommendedAction: "align_tool_observations",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.UNKNOWN_TOOL]: {
    recommendedAction: "correct_verification_inputs",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.ROW_ABSENT]: {
    recommendedAction: "reconcile_downstream_state",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.RELATED_ROWS_ABSENT]: {
    recommendedAction: "reconcile_downstream_state",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.RELATIONAL_EXPECTATION_MISMATCH]: {
    recommendedAction: "reconcile_downstream_state",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.RELATIONAL_SCALAR_UNUSABLE]: {
    recommendedAction: "improve_read_connectivity",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.VALUE_MISMATCH]: {
    recommendedAction: "reconcile_downstream_state",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.DUPLICATE_ROWS]: { recommendedAction: "deduplicate", automationSafe: false },
  [SQL_VERIFICATION_OUTCOME_CODE.ROW_NOT_OBSERVED_WITHIN_WINDOW]: {
    recommendedAction: "improve_read_connectivity",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_UNCERTAIN_WITHIN_WINDOW]: {
    recommendedAction: "improve_read_connectivity",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.CONNECTOR_ERROR]: {
    recommendedAction: "improve_read_connectivity",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.ROW_SHAPE_MISMATCH]: {
    recommendedAction: "improve_read_connectivity",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.UNREADABLE_VALUE]: {
    recommendedAction: "improve_read_connectivity",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_PARTIAL]: {
    recommendedAction: "resolve_multi_effect_failures",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_ALL_FAILED]: {
    recommendedAction: "resolve_multi_effect_failures",
    automationSafe: false,
  },
  [SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_INCOMPLETE]: {
    recommendedAction: "correct_verification_inputs",
    automationSafe: false,
  },
  [STEP_NO_REASON_CODE]: { recommendedAction: "fix_event_ingest_and_steps", automationSafe: false },
  [TEST_BLOCKING_CODE]: { recommendedAction: "fix_event_ingest_and_steps", automationSafe: false },

  PLAN_RULE_ROW_KIND_MISMATCH: { recommendedAction: "reconcile_downstream_state", automationSafe: false },
  PLAN_RULE_FORBIDDEN_ROW: { recommendedAction: "reconcile_downstream_state", automationSafe: false },
  PLAN_RULE_REQUIRED_ROW_MISSING: { recommendedAction: "reconcile_downstream_state", automationSafe: false },
  PLAN_RULE_ALLOWLIST_VIOLATION: { recommendedAction: "reconcile_downstream_state", automationSafe: false },
  PLAN_RULE_RENAME_MISMATCH: { recommendedAction: "reconcile_downstream_state", automationSafe: false },
};

for (const c of Object.values(REGISTRY_RESOLVER_CODE)) {
  STEP_CODE_TO_CATEGORY[c] = "bad_input";
  STEP_CODE_TO_REMEDIATION[c] = { recommendedAction: "correct_verification_inputs", automationSafe: false };
}

/** Classify a production step primary reason code (P-CAT-4 tables D/E); excludes ambiguous/unclassified. */
export function productionStepReasonCodeToActionableCategory(code: string): ActionableFailureCategory {
  if (code in RUN_LEVEL_CODE_TO_ORIGIN && !(code in REASON_CODE_TO_ORIGIN)) {
    throw new Error(
      `productionStepReasonCodeToActionableCategory: run-level-only code ${code} is not a production step reason code`,
    );
  }
  const cat = STEP_CODE_TO_CATEGORY[code];
  if (cat === undefined) {
    throw new Error(`productionStepReasonCodeToActionableCategory: missing partition for code ${code}`);
  }
  return cat;
}

export function productionStepReasonCodeToRemediation(code: string): RemediationRow {
  if (code in RUN_LEVEL_CODE_TO_ORIGIN && !(code in REASON_CODE_TO_ORIGIN)) {
    throw new Error(
      `productionStepReasonCodeToRemediation: run-level-only code ${code} is not a production step reason code`,
    );
  }
  const row = STEP_CODE_TO_REMEDIATION[code];
  if (row === undefined) {
    throw new Error(`productionStepReasonCodeToRemediation: missing remediation for code ${code}`);
  }
  return row;
}

function classifyRunLevelItem(codes: string[] | undefined): ActionableFailureCategory {
  const c = codes ?? [];
  if (c.includes("MALFORMED_EVENT_LINE")) return "bad_input";
  if (c.includes("NO_STEPS_FOR_WORKFLOW")) return "control_flow_problem";
  if (c.includes(TEST_BLOCKING_CODE)) return "control_flow_problem";
  return "unclassified";
}

function classifyRunContextItem(codes: string[] | undefined): ActionableFailureCategory {
  const list = codes ?? [];
  for (const code of list) {
    const cat = RUN_CONTEXT_CODE_TO_CATEGORY[code];
    if (cat !== undefined) return cat;
  }
  return "unclassified";
}

function classifyEventSequenceItem(codes: string[] | undefined): ActionableFailureCategory {
  const list = codes ?? [];
  for (const code of list) {
    if (EVENT_SEQUENCE_TO_CATEGORY[code] !== undefined) return "control_flow_problem";
  }
  return "unclassified";
}

function classifyStepOrEffectItem(codes: string[] | undefined): ActionableFailureCategory {
  const primary = codes?.[0];
  if (primary === undefined) return "unclassified";
  if (primary in RUN_LEVEL_CODE_TO_ORIGIN) return classifyRunLevelItem(codes);
  return STEP_CODE_TO_CATEGORY[primary] ?? "unclassified";
}

function remediationForRunLevelItem(codes: string[] | undefined): RemediationRow {
  const c = codes ?? [];
  if (c.includes("MALFORMED_EVENT_LINE")) return RUN_LEVEL_CODE_TO_REMEDIATION.MALFORMED_EVENT_LINE;
  if (c.includes("NO_STEPS_FOR_WORKFLOW")) return RUN_LEVEL_CODE_TO_REMEDIATION.NO_STEPS_FOR_WORKFLOW;
  if (c.includes(TEST_BLOCKING_CODE)) return RUN_LEVEL_CODE_TO_REMEDIATION[TEST_BLOCKING_CODE];
  return MANUAL_REMEDIATION;
}

function remediationForRunContextItem(codes: string[] | undefined): RemediationRow {
  const list = codes ?? [];
  for (const code of list) {
    const row = RUN_CONTEXT_CODE_TO_REMEDIATION[code];
    if (row !== undefined) return row;
  }
  return MANUAL_REMEDIATION;
}

function remediationForEventSequenceItem(codes: string[] | undefined): RemediationRow {
  const list = codes ?? [];
  for (const code of list) {
    const row = EVENT_SEQUENCE_CODE_TO_REMEDIATION[code];
    if (row !== undefined) return row;
  }
  return MANUAL_REMEDIATION;
}

function remediationForStepOrEffectItem(codes: string[] | undefined): RemediationRow {
  const primary = codes?.[0];
  if (primary === undefined) return MANUAL_REMEDIATION;
  if (primary in RUN_LEVEL_CODE_TO_ORIGIN && !(primary in REASON_CODE_TO_ORIGIN)) {
    return remediationForRunLevelItem(codes);
  }
  return STEP_CODE_TO_REMEDIATION[primary] ?? MANUAL_REMEDIATION;
}

/**
 * Same `failureAnalysis.evidence` walk order as `deriveActionableCategory` (plan F: A→C→B→step/effect).
 * Used only when category is neither `ambiguous` nor `unclassified`.
 */
function deriveRemediationFromEvidence(failureAnalysis: FailureAnalysisBase): RemediationRow {
  for (const ev of failureAnalysis.evidence) {
    if (ev.scope === "run_level") {
      return remediationForRunLevelItem(ev.codes);
    }
    if (ev.scope === "run_context") {
      return remediationForRunContextItem(ev.codes);
    }
    if (ev.scope === "event_sequence") {
      return remediationForEventSequenceItem(ev.codes);
    }
    if (ev.scope === "step" || ev.scope === "effect") {
      return remediationForStepOrEffectItem(ev.codes);
    }
  }
  return MANUAL_REMEDIATION;
}

/**
 * P-CAT-1–4: first matching evidence item by scope (plan F: A→C→B→step/effect).
 */
export function deriveActionableCategory(failureAnalysis: FailureAnalysisBase): ActionableFailureCategory {
  if (failureAnalysis.unknownReasonCodes.length > 0) return "unclassified";
  const alts = failureAnalysis.alternativeHypotheses;
  if (alts !== undefined && alts.length > 0) return "ambiguous";
  if (failureAnalysis.confidence === "low") return "ambiguous";

  for (const ev of failureAnalysis.evidence) {
    if (ev.scope === "run_level") {
      return classifyRunLevelItem(ev.codes);
    }
    if (ev.scope === "run_context") {
      return classifyRunContextItem(ev.codes);
    }
    if (ev.scope === "event_sequence") {
      return classifyEventSequenceItem(ev.codes);
    }
    if (ev.scope === "step" || ev.scope === "effect") {
      return classifyStepOrEffectItem(ev.codes);
    }
  }
  return "unclassified";
}

/** Workflow severity S-1–S4 only; no `low`. */
export function deriveSeverityWorkflow(engine: WorkflowEngineResult): ActionableFailureSeverity {
  if (engine.status === "inconsistent") return "high";
  if (engine.steps.some((s) => ["missing", "inconsistent", "partially_verified"].includes(s.status))) {
    return "high";
  }
  if (engine.runLevelReasons.length > 0 || engine.eventSequenceIntegrity.kind === "irregular") {
    return "medium";
  }
  if (engine.status === "incomplete") return "medium";
  return "medium";
}

export function deriveActionableFailureWorkflow(
  engine: WorkflowEngineResult,
  failureAnalysis: FailureAnalysisBase,
): ActionableFailure {
  const category = deriveActionableCategory(failureAnalysis);
  const severity = deriveSeverityWorkflow(engine);
  if (category === "ambiguous" || category === "unclassified") {
    return { category, severity, ...MANUAL_REMEDIATION };
  }
  const { recommendedAction, automationSafe } = deriveRemediationFromEvidence(failureAnalysis);
  return { category, severity, recommendedAction, automationSafe };
}

function operationalActionableMaps(): {
  category: Record<OperationalCode, ActionableFailureCategory>;
  severity: Record<OperationalCode, ActionableFailureSeverity>;
  recommendedAction: Record<OperationalCode, RecommendedActionCode>;
  automationSafe: Record<OperationalCode, boolean>;
} {
  const category = {} as Record<OperationalCode, ActionableFailureCategory>;
  const severity = {} as Record<OperationalCode, ActionableFailureSeverity>;
  const recommendedAction = {} as Record<OperationalCode, RecommendedActionCode>;
  const automationSafe = {} as Record<OperationalCode, boolean>;
  for (const code of Object.values(CLI_OPERATIONAL_CODES) as OperationalCode[]) {
    const row = OPERATIONAL_DISPOSITION[code];
    category[code] = row.actionableCategory;
    severity[code] = row.actionableSeverity;
    recommendedAction[code] = row.recommendedAction;
    automationSafe[code] = row.automationSafe;
  }
  return { category, severity, recommendedAction, automationSafe };
}

const _opAct = operationalActionableMaps();

/** Operational code → actionable category (CLI envelope). */
export const OPERATIONAL_CODE_TO_ACTIONABLE_CATEGORY: Record<OperationalCode, ActionableFailureCategory> =
  _opAct.category;

export const OPERATIONAL_CODE_TO_SEVERITY: Record<OperationalCode, ActionableFailureSeverity> = _opAct.severity;

export const OPERATIONAL_CODE_TO_RECOMMENDED_ACTION: Record<OperationalCode, RecommendedActionCode> =
  _opAct.recommendedAction;

export const OPERATIONAL_CODE_TO_AUTOMATION_SAFE: Record<OperationalCode, boolean> = _opAct.automationSafe;

export function deriveActionableFailureOperational(code: string): ActionableFailure {
  const c = code as OperationalCode;
  const row = OPERATIONAL_DISPOSITION[c];
  if (row === undefined) {
    return {
      category: "unclassified",
      severity: "medium",
      recommendedAction: "manual_review",
      automationSafe: false,
    };
  }
  return {
    category: row.actionableCategory,
    severity: row.actionableSeverity,
    recommendedAction: row.recommendedAction,
    automationSafe: row.automationSafe,
  };
}

export type PerRunActionable = {
  runIndex: number;
  category: string;
  severity: string;
  recommendedAction: RecommendedActionCode;
  automationSafe: boolean;
};

export type ActionableCategoryRecurrenceRow = {
  category: string;
  runIndicesAscending: number[];
  runsHitCount: number;
  maxConsecutiveRunStreak: number;
};

/** Longest run of consecutive integers contained in `sortedUniqueIndices`. */
export function maxConsecutiveStreak(sortedUniqueIndices: number[]): number {
  if (sortedUniqueIndices.length === 0) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < sortedUniqueIndices.length; i++) {
    if (sortedUniqueIndices[i] === sortedUniqueIndices[i - 1]! + 1) {
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 1;
    }
  }
  return best;
}

export function buildActionableCategoryRecurrence(perRun: PerRunActionable[]): ActionableCategoryRecurrenceRow[] {
  const byCat = new Map<string, number[]>();
  for (const r of perRun) {
    if (r.category === "complete") continue;
    const arr = byCat.get(r.category) ?? [];
    arr.push(r.runIndex);
    byCat.set(r.category, arr);
  }
  const rows: ActionableCategoryRecurrenceRow[] = [];
  for (const [category, indices] of byCat) {
    const runIndicesAscending = [...new Set(indices)].sort((a, b) => a - b);
    rows.push({
      category,
      runIndicesAscending,
      runsHitCount: runIndicesAscending.length,
      maxConsecutiveRunStreak: maxConsecutiveStreak(runIndicesAscending),
    });
  }
  rows.sort((a, b) => a.category.localeCompare(b.category));
  return rows;
}

export function buildCategoryHistogram(perRun: PerRunActionable[]): Array<{ category: string; count: number }> {
  const m = new Map<string, number>();
  for (const r of perRun) {
    m.set(r.category, (m.get(r.category) ?? 0) + 1);
  }
  const out = [...m.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category));
  return out;
}
