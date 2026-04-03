export type ToolObservedEvent = {
  schemaVersion: 1;
  workflowId: string;
  seq: number;
  type: "tool_observed";
  toolId: string;
  params: Record<string, unknown>;
  timestamp?: string;
};

export type ToolRegistryEntry = {
  toolId: string;
  effectDescriptionTemplate: string;
  verification: {
    kind: "sql_row";
    table: { const: string } | { pointer: string };
    key: {
      column: { const: string } | { pointer: string };
      value: { const: string | number | boolean | null } | { pointer: string };
    };
    requiredFields: { pointer: string };
  };
};

export type VerificationRequest = {
  kind: "sql_row";
  table: string;
  keyColumn: string;
  keyValue: string;
  requiredFields: Record<string, string>;
};

export type StepStatus =
  | "verified"
  | "missing"
  | "partial"
  | "inconsistent"
  | "incomplete_verification";

export type Reason = { code: string; message: string; field?: string };

export type StepOutcome = {
  seq: number;
  toolId: string;
  intendedEffect: string;
  verificationRequest: VerificationRequest | null;
  status: StepStatus;
  reasons: Reason[];
  evidenceSummary: Record<string, unknown>;
};

export type WorkflowStatus = "complete" | "incomplete" | "inconsistent";

export type WorkflowResult = {
  schemaVersion: 1;
  workflowId: string;
  status: WorkflowStatus;
  runLevelCodes: string[];
  steps: StepOutcome[];
};

export type LoadEventsResult = {
  events: ToolObservedEvent[];
  runLevelCodes: string[];
};
