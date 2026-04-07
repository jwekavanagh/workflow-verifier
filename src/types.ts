import type { FailureOrigin } from "./failureOriginTypes.js";

/** v1 wire line: `tool_observed` without `runEventId`. */
export type ToolObservedEventV1 = {
  schemaVersion: 1;
  workflowId: string;
  seq: number;
  type: "tool_observed";
  toolId: string;
  params: Record<string, unknown>;
  timestamp?: string;
};

/** v2 wire line: same tool fields plus stable graph ids. */
export type ToolObservedEventV2 = {
  schemaVersion: 2;
  workflowId: string;
  runEventId: string;
  parentRunEventId?: string;
  type: "tool_observed";
  seq: number;
  toolId: string;
  params: Record<string, unknown>;
  timestamp?: string;
};

export type ToolObservedEvent = ToolObservedEventV1 | ToolObservedEventV2;

export type ModelTurnRunEvent = {
  schemaVersion: 2;
  workflowId: string;
  runEventId: string;
  parentRunEventId?: string;
  type: "model_turn";
  status: "completed" | "error" | "aborted" | "incomplete";
  summary?: string;
  timestamp?: string;
};

export type RetrievalRunEvent = {
  schemaVersion: 2;
  workflowId: string;
  runEventId: string;
  parentRunEventId?: string;
  type: "retrieval";
  source: string;
  status: "ok" | "empty" | "error";
  querySummary?: string;
  hitCount?: number;
  timestamp?: string;
};

export type ControlRunEvent = {
  schemaVersion: 2;
  workflowId: string;
  runEventId: string;
  parentRunEventId?: string;
  type: "control";
  controlKind: "branch" | "loop" | "interrupt" | "gate" | "run_completed";
  label?: string;
  decision?: "taken" | "skipped";
  timestamp?: string;
};

export type ToolSkippedRunEvent = {
  schemaVersion: 2;
  workflowId: string;
  runEventId: string;
  parentRunEventId?: string;
  type: "tool_skipped";
  toolId: string;
  reason: string;
  timestamp?: string;
};

export type RunEvent =
  | ToolObservedEvent
  | ModelTurnRunEvent
  | RetrievalRunEvent
  | ControlRunEvent
  | ToolSkippedRunEvent;

/** Registry row verification (table, key, requiredFields pointers) without discriminant. */
export type SqlRowVerificationSpec = {
  table: { const: string } | { pointer: string };
  key: {
    column: { const: string } | { pointer: string };
    value: { const: string | number | boolean | null } | { pointer: string };
  };
  requiredFields: { pointer: string };
};

/** Expectation for aggregate / join_count (numeric only). */
export type RelationalExpectSpec = {
  op: "eq" | "gte" | "lte";
  value: { const: number } | { pointer: string };
};

export type SqlRelationalCheckSpec =
  | {
      checkKind: "aggregate";
      id: string;
      table: { const: string } | { pointer: string };
      fn: "COUNT_STAR" | "SUM";
      sumColumn?: { const: string } | { pointer: string };
      whereEq?: Array<{
        column: { const: string } | { pointer: string };
        value: { const: string | number | boolean | null } | { pointer: string };
      }>;
      expect: RelationalExpectSpec;
    }
  | {
      checkKind: "join_count";
      id: string;
      leftTable: { const: string } | { pointer: string };
      rightTable: { const: string } | { pointer: string };
      join: {
        leftColumn: { const: string } | { pointer: string };
        rightColumn: { const: string } | { pointer: string };
      };
      whereEq?: Array<{
        tableSide: "left" | "right";
        column: { const: string } | { pointer: string };
        value: { const: string | number | boolean | null } | { pointer: string };
      }>;
      expect: RelationalExpectSpec;
    }
  | {
      checkKind: "related_exists";
      id: string;
      childTable: { const: string } | { pointer: string };
      fkColumn: { const: string } | { pointer: string };
      fkValue: { const: string | number | boolean | null } | { pointer: string };
      whereEq?: Array<{
        column: { const: string } | { pointer: string };
        value: { const: string | number | boolean | null } | { pointer: string };
      }>;
    };

export type ToolRegistryVerification =
  | ({ kind: "sql_row" } & SqlRowVerificationSpec)
  | {
      kind: "sql_effects";
      effects: Array<{ id: string } & SqlRowVerificationSpec>;
    }
  | {
      kind: "sql_relational";
      checks: SqlRelationalCheckSpec[];
    };

export type ToolRegistryEntry = {
  toolId: string;
  effectDescriptionTemplate: string;
  verification: ToolRegistryVerification;
};

export type VerificationScalar = string | number | boolean | null;

export type VerificationRequest = {
  kind: "sql_row";
  table: string;
  keyColumn: string;
  keyValue: string;
  requiredFields: Record<string, VerificationScalar>;
};

/** One resolved row check with stable id (registry `sql_effects` only). */
export type ResolvedEffect = { id: string; request: VerificationRequest };

/** Resolved relational check (no pointers). */
export type ResolvedRelationalCheck =
  | {
      checkKind: "related_exists";
      id: string;
      childTable: string;
      fkColumn: string;
      fkValue: string;
      whereEq: Array<{ column: string; value: string }>;
    }
  | {
      checkKind: "aggregate";
      id: string;
      table: string;
      fn: "COUNT_STAR" | "SUM";
      sumColumn?: string;
      whereEq: Array<{ column: string; value: string }>;
      expectOp: "eq" | "gte" | "lte";
      expectValue: number;
    }
  | {
      checkKind: "join_count";
      id: string;
      leftTable: string;
      rightTable: string;
      leftJoinColumn: string;
      rightJoinColumn: string;
      whereEq: Array<{ side: "left" | "right"; column: string; value: string }>;
      expectOp: "eq" | "gte" | "lte";
      expectValue: number;
    };

/** One resolved relational check with stable id (registry `sql_relational`). */
export type ResolvedRelationalItem = { id: string; check: ResolvedRelationalCheck };

/** Emitted on the step when registry used `sql_effects`. */
export type SqlEffectsVerificationPayload = {
  kind: "sql_effects";
  effects: Array<
    {
      id: string;
      kind: "sql_row";
      table: string;
      keyColumn: string;
      keyValue: string;
      requiredFields: Record<string, VerificationScalar>;
    }
  >;
};

/** Emitted when registry used `sql_relational`. */
export type SqlRelationalVerificationPayload = {
  kind: "sql_relational";
  checks: ResolvedRelationalCheck[];
};

export type StepVerificationRequest =
  | VerificationRequest
  | SqlEffectsVerificationPayload
  | SqlRelationalVerificationPayload
  | null;

export type StepStatus =
  | "verified"
  | "missing"
  | "inconsistent"
  | "incomplete_verification"
  | "partially_verified"
  | "uncertain";

/** Active verification timing/consistency contract (emitted on WorkflowResult). */
export type VerificationPolicy = {
  consistencyMode: "strong" | "eventual";
  verificationWindowMs: number;
  pollIntervalMs: number;
};

export type Reason = { code: string; message: string; field?: string };

/** Present on wire when `status !== "verified"`; omitted when verified (schema v5). */
export type FailureDiagnostic =
  | "workflow_execution"
  | "verification_setup"
  | "observation_uncertainty";

/** Rendered registry template for the evaluated tool_observed step (audit / review). */
export type IntendedEffect = {
  narrative: string;
};

/** Canonical digest of evaluated `tool_observed.params` (same serialization as retry divergence). */
export type ObservedExecution = {
  paramsCanonical: string;
};

export type StepOutcome = {
  seq: number;
  toolId: string;
  intendedEffect: IntendedEffect;
  observedExecution: ObservedExecution;
  verificationRequest: StepVerificationRequest;
  status: StepStatus;
  reasons: Reason[];
  evidenceSummary: Record<string, unknown>;
  /** Observations in this logical step (same seq), capture order. */
  repeatObservationCount: number;
  /** 1-based; equals repeatObservationCount (last in capture order is evaluated). */
  evaluatedObservationOrdinal: number;
  /** Required when status is not verified; must be absent when status is verified. */
  failureDiagnostic?: FailureDiagnostic;
};

export type WorkflowStatus = "complete" | "incomplete" | "inconsistent";

export type EventSequenceIntegrity =
  | { kind: "normal" }
  | { kind: "irregular"; reasons: Reason[] };

/** Summary of the last run event in capture order (for execution-path completeness signals). */
export type VerificationRunContextLastEvent = {
  ingestIndex: number;
  type: RunEvent["type"];
  modelTurnStatus?: ModelTurnRunEvent["status"];
};

/** Digest of v2 run graph + tool_observed positions; built at verify time from `runEvents`. */
export type VerificationRunContext = {
  maxWireSchemaVersion: 1 | 2;
  retrievalEvents: Array<{
    ingestIndex: number;
    runEventId: string | null;
    source: string;
    status: "ok" | "empty" | "error";
    hitCount?: number;
  }>;
  controlEvents: Array<{
    ingestIndex: number;
    runEventId: string | null;
    controlKind: ControlRunEvent["controlKind"];
    decision?: "taken" | "skipped";
    label?: string;
  }>;
  modelTurnEvents: Array<{
    ingestIndex: number;
    runEventId: string | null;
    status: ModelTurnRunEvent["status"];
  }>;
  toolSkippedEvents: Array<{
    ingestIndex: number;
    toolId: string;
    reason: string;
  }>;
  /** Last capture-order ingest index per tool_observed seq (string keys in JSON). */
  toolObservedIngestIndexBySeq: Record<string, number>;
  /** Minimum ingest index among `tool_observed` events; null if none. */
  firstToolObservedIngestIndex: number | null;
  /** True if any v2 `control` event has `controlKind === "run_completed"`. */
  hasRunCompletedControl: boolean;
  /** Last event in capture order; null if `runEvents` was empty. */
  lastRunEvent: VerificationRunContextLastEvent | null;
};

export type FailureConfidence = "high" | "medium" | "low";

export type ActionableFailureCategory =
  | "decision_error"
  | "bad_input"
  | "retrieval_failure"
  | "control_flow_problem"
  | "state_inconsistency"
  | "downstream_execution_failure"
  | "ambiguous"
  | "unclassified";

export type ActionableFailureSeverity = "high" | "medium" | "low";

/** Closed set; mirrors `schemas/workflow-truth-report.schema.json` → `$defs/recommendedAction`. */
export type RecommendedActionCode =
  | "none"
  | "manual_review"
  | "deduplicate"
  | "reconcile_downstream_state"
  | "correct_verification_inputs"
  | "improve_read_connectivity"
  | "resolve_multi_effect_failures"
  | "align_tool_observations"
  | "fix_event_ingest_and_steps"
  | "fix_event_sequence_order"
  | "fix_run_context_controls"
  | "fix_cli_usage"
  | "fix_registry_events_or_compare_files"
  | "fix_verification_database_connection"
  | "fix_saved_workflow_json"
  | "fix_compare_workflow_inputs"
  | "fix_execution_trace_structure"
  | "fix_verification_policy_and_hook"
  | "fix_plan_document_and_patterns"
  | "fix_plan_transition_cli_and_refs"
  | "upgrade_git_or_retry_git";

export const RECOMMENDED_ACTION_CODES = [
  "none",
  "manual_review",
  "deduplicate",
  "reconcile_downstream_state",
  "correct_verification_inputs",
  "improve_read_connectivity",
  "resolve_multi_effect_failures",
  "align_tool_observations",
  "fix_event_ingest_and_steps",
  "fix_event_sequence_order",
  "fix_run_context_controls",
  "fix_cli_usage",
  "fix_registry_events_or_compare_files",
  "fix_verification_database_connection",
  "fix_saved_workflow_json",
  "fix_compare_workflow_inputs",
  "fix_execution_trace_structure",
  "fix_verification_policy_and_hook",
  "fix_plan_document_and_patterns",
  "fix_plan_transition_cli_and_refs",
  "upgrade_git_or_retry_git",
] as const satisfies readonly RecommendedActionCode[];

export type ActionableFailure = {
  category: ActionableFailureCategory;
  severity: ActionableFailureSeverity;
  recommendedAction: RecommendedActionCode;
  automationSafe: boolean;
};

export type FailureAnalysisEvidenceItem = {
  scope: "run_context" | "run_level" | "event_sequence" | "step" | "effect";
  codes?: string[];
  ingestIndex?: number;
  seq?: number;
  toolId?: string;
  effectId?: string;
  source?: string;
  runEventId?: string | null;
};

export type FailureAnalysisAlternative = {
  primaryOrigin: FailureOrigin;
  rationale: string;
};

/** Built by `buildFailureAnalysis`; enriched with `actionableFailure` in `buildWorkflowTruthReport`. */
export type FailureAnalysisBase = {
  summary: string;
  primaryOrigin: FailureOrigin;
  confidence: FailureConfidence;
  /** Reason codes not present in SSOT origin maps (sorted unique). */
  unknownReasonCodes: string[];
  evidence: FailureAnalysisEvidenceItem[];
  alternativeHypotheses?: FailureAnalysisAlternative[];
};

export type FailureAnalysis = FailureAnalysisBase & { actionableFailure: ActionableFailure };

export type CliFailureDiagnosis = {
  summary: string;
  primaryOrigin: FailureOrigin;
  confidence: FailureConfidence;
  evidence: Array<{ referenceCode: string }>;
  actionableFailure: ActionableFailure;
};

/** Aggregated engine payload before truth report attachment (`schemaVersion` 7). */
export type WorkflowEngineResult = {
  schemaVersion: 7;
  workflowId: string;
  status: WorkflowStatus;
  runLevelReasons: Reason[];
  verificationPolicy: VerificationPolicy;
  eventSequenceIntegrity: EventSequenceIntegrity;
  steps: StepOutcome[];
  verificationRunContext: VerificationRunContext;
};

export type WorkflowTruthIssue = {
  code: string;
  message: string;
  category: FailureDiagnostic;
};

export type WorkflowTruthEffect = {
  id: string;
  outcomeLabel:
    | "VERIFIED"
    | "FAILED_ROW_MISSING"
    | "FAILED_VALUE_MISMATCH"
    | "INCOMPLETE_CANNOT_VERIFY";
  reasons: Reason[];
};

export type PathConcernCategory =
  | "context_quality"
  | "decision_execution"
  | "tool_selection_execution"
  | "action_inputs_invalid"
  | "workflow_completeness"
  | "capture_integrity";

export type PathFindingSeverity = "high" | "medium" | "low";

export type ExecutionPathEvidenceItem = {
  scope: "run_context" | "run_level" | "event_sequence" | "step";
  codes?: string[];
  ingestIndex?: number;
  seq?: number;
  toolId?: string;
  source?: string;
  runEventId?: string | null;
};

export type ExecutionPathFinding = {
  code: string;
  severity: PathFindingSeverity;
  concernCategory: PathConcernCategory;
  message: string;
  evidence: ExecutionPathEvidenceItem;
};

export type WorkflowTruthStep = {
  seq: number;
  toolId: string;
  outcomeLabel:
    | "VERIFIED"
    | "FAILED_ROW_MISSING"
    | "FAILED_VALUE_MISMATCH"
    | "INCOMPLETE_CANNOT_VERIFY"
    | "PARTIALLY_VERIFIED"
    | "UNCERTAIN_NOT_OBSERVED_WITHIN_WINDOW";
  observations: { evaluatedOrdinal: number; repeatCount: number };
  reasons: Reason[];
  intendedEffect: IntendedEffect;
  observedExecution: ObservedExecution;
  failureCategory?: FailureDiagnostic;
  verifyTarget: string | null;
  effects?: WorkflowTruthEffect[];
};

export type WorkflowTruthReport = {
  schemaVersion: 6;
  workflowId: string;
  workflowStatus: WorkflowStatus;
  trustSummary: string;
  runLevelIssues: WorkflowTruthIssue[];
  eventSequence:
    | { kind: "normal" }
    | { kind: "irregular"; issues: WorkflowTruthIssue[] };
  steps: WorkflowTruthStep[];
  /** JSON `null` when workflow is complete; object when incomplete or inconsistent. */
  failureAnalysis: FailureAnalysis | null;
  executionPathFindings: ExecutionPathFinding[];
  executionPathSummary: string;
};

/** Emitted verification result on stdout / public API (`schemaVersion` 13). */
export type WorkflowResult = Omit<WorkflowEngineResult, "schemaVersion"> & {
  schemaVersion: 13;
  workflowTruthReport: WorkflowTruthReport;
};

export type TraceStepKind =
  | "skipped"
  | "branch_taken"
  | "branch_skipped"
  | "failed"
  | "success"
  | "neutral"
  | "divergent_observations"
  | "repeated_observation";

export type ExecutionTraceVerificationLink = {
  stepIndex: number;
  seq: number;
  engineStepStatus: StepStatus;
  truthOutcomeLabel: string;
};

export type ExecutionTraceNode = {
  ingestIndex: number;
  runEventId: string;
  wireSchemaVersion: 1 | 2;
  wireType: RunEvent["type"];
  parentRunEventId: string | null;
  traceStepKind: TraceStepKind;
  toolSeq: number | null;
  toolId: string | null;
  verificationLink: ExecutionTraceVerificationLink | null;
};

export type ExecutionTraceBackwardPath =
  | {
      pathKind: "workflow_terminal";
      seedRunEventId: string;
      ancestorRunEventIds: string[];
    }
  | {
      pathKind: "verification_step";
      seedRunEventId: string;
      ancestorRunEventIds: string[];
      stepIndex: number;
      seq: number;
    };

export type ExecutionTraceView = {
  schemaVersion: 1;
  workflowId: string;
  runCompletion: "completed" | "unknown_or_interrupted";
  malformedEventLineCount: number;
  nodes: ExecutionTraceNode[];
  backwardPaths: ExecutionTraceBackwardPath[];
};

export type LoadEventsResult = {
  /** `tool_observed` only, sorted for verification (`prepareWorkflowEvents`). */
  events: ToolObservedEvent[];
  /** All valid run events for the workflow in file / capture order. */
  runEvents: RunEvent[];
  runLevelReasons: Reason[];
  eventSequenceIntegrity: EventSequenceIntegrity;
  /** NDJSON lines that failed JSON parse or event schema (same rules as batch load). */
  malformedEventLineCount: number;
};

/** Batch / CLI verification target (`verifyWorkflow`). In-process hook remains SQLite `dbPath` only. */
export type VerificationDatabase =
  | { kind: "sqlite"; path: string }
  | { kind: "postgres"; connectionString: string };
