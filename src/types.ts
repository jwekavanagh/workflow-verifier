export type ToolObservedEvent = {
  schemaVersion: 1;
  workflowId: string;
  seq: number;
  type: "tool_observed";
  toolId: string;
  params: Record<string, unknown>;
  timestamp?: string;
};

/** Registry row verification (table, key, requiredFields pointers) without discriminant. */
export type SqlRowVerificationSpec = {
  table: { const: string } | { pointer: string };
  key: {
    column: { const: string } | { pointer: string };
    value: { const: string | number | boolean | null } | { pointer: string };
  };
  requiredFields: { pointer: string };
};

export type ToolRegistryVerification =
  | ({ kind: "sql_row" } & SqlRowVerificationSpec)
  | {
      kind: "sql_effects";
      effects: Array<{ id: string } & SqlRowVerificationSpec>;
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

export type StepVerificationRequest = VerificationRequest | SqlEffectsVerificationPayload | null;

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

export type StepOutcome = {
  seq: number;
  toolId: string;
  intendedEffect: string;
  verificationRequest: StepVerificationRequest;
  status: StepStatus;
  reasons: Reason[];
  evidenceSummary: Record<string, unknown>;
  /** Observations in this logical step (same seq), capture order. */
  repeatObservationCount: number;
  /** 1-based; equals repeatObservationCount (last in capture order is evaluated). */
  evaluatedObservationOrdinal: number;
};

export type WorkflowStatus = "complete" | "incomplete" | "inconsistent";

export type EventSequenceIntegrity =
  | { kind: "normal" }
  | { kind: "irregular"; reasons: Reason[] };

export type WorkflowResult = {
  schemaVersion: 4;
  workflowId: string;
  status: WorkflowStatus;
  runLevelCodes: string[];
  runLevelReasons: Reason[];
  verificationPolicy: VerificationPolicy;
  eventSequenceIntegrity: EventSequenceIntegrity;
  steps: StepOutcome[];
};

export type LoadEventsResult = {
  events: ToolObservedEvent[];
  runLevelReasons: Reason[];
  eventSequenceIntegrity: EventSequenceIntegrity;
};

/** Batch / CLI verification target (`verifyWorkflow`). In-process hook remains SQLite `dbPath` only. */
export type VerificationDatabase =
  | { kind: "sqlite"; path: string }
  | { kind: "postgres"; connectionString: string };
