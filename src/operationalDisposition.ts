import { CLI_OPERATIONAL_CODES, type OperationalCode } from "./cliOperationalCodes.js";
import type { FailureOrigin } from "./failureOriginTypes.js";
import {
  COMPARE_INPUT_RUN_LEVEL_INCONSISTENT_MESSAGE,
  WORKFLOW_RESULT_RUN_LEVEL_CODES_MISMATCH_MESSAGE,
} from "./runLevelDriftMessages.js";
import type { ActionableFailureCategory, ActionableFailureSeverity } from "./types.js";

export type OperationalDispositionRow = {
  origin: FailureOrigin;
  summary: string;
  actionableCategory: ActionableFailureCategory;
  actionableSeverity: ActionableFailureSeverity;
};

/**
 * Sole source of operational diagnosis values (origin, summary, actionable category/severity).
 * Catalog and actionableFailure derive exported maps from this object only.
 */
export const OPERATIONAL_DISPOSITION = {
  [CLI_OPERATIONAL_CODES.CLI_USAGE]: {
    origin: "inputs",
    summary: "Invalid or incomplete CLI arguments for verify-workflow.",
    actionableCategory: "bad_input",
    actionableSeverity: "low",
  },
  [CLI_OPERATIONAL_CODES.REGISTRY_READ_FAILED]: {
    origin: "inputs",
    summary: "Tools registry file could not be read.",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.REGISTRY_JSON_SYNTAX]: {
    origin: "inputs",
    summary: "Tools registry JSON could not be parsed.",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.REGISTRY_SCHEMA_INVALID]: {
    origin: "inputs",
    summary: "Tools registry failed schema validation.",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.REGISTRY_DUPLICATE_TOOL_ID]: {
    origin: "inputs",
    summary: "Tools registry contains duplicate toolId entries.",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.EVENTS_READ_FAILED]: {
    origin: "inputs",
    summary: "Events file could not be read.",
    actionableCategory: "bad_input",
    actionableSeverity: "high",
  },
  [CLI_OPERATIONAL_CODES.SQLITE_DATABASE_OPEN_FAILED]: {
    origin: "downstream_system_state",
    summary: "SQLite verification database could not be opened.",
    actionableCategory: "downstream_execution_failure",
    actionableSeverity: "high",
  },
  [CLI_OPERATIONAL_CODES.POSTGRES_CLIENT_SETUP_FAILED]: {
    origin: "downstream_system_state",
    summary: "Postgres verification client could not be established.",
    actionableCategory: "downstream_execution_failure",
    actionableSeverity: "high",
  },
  [CLI_OPERATIONAL_CODES.WORKFLOW_RESULT_SCHEMA_INVALID]: {
    origin: "workflow_flow",
    summary: "Emitted workflow result failed JSON schema validation.",
    actionableCategory: "control_flow_problem",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.INTERNAL_ERROR]: {
    origin: "workflow_flow",
    summary: "Unexpected internal error in the execution truth layer.",
    actionableCategory: "control_flow_problem",
    actionableSeverity: "high",
  },
  [CLI_OPERATIONAL_CODES.COMPARE_USAGE]: {
    origin: "workflow_flow",
    summary: "Invalid or incomplete arguments for verify-workflow compare.",
    actionableCategory: "bad_input",
    actionableSeverity: "low",
  },
  [CLI_OPERATIONAL_CODES.COMPARE_INSUFFICIENT_RUNS]: {
    origin: "workflow_flow",
    summary: "compare requires at least two WorkflowResult inputs.",
    actionableCategory: "control_flow_problem",
    actionableSeverity: "low",
  },
  [CLI_OPERATIONAL_CODES.COMPARE_WORKFLOW_ID_MISMATCH]: {
    origin: "workflow_flow",
    summary: "Compared WorkflowResult files use different workflowId values.",
    actionableCategory: "control_flow_problem",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.COMPARE_INPUT_READ_FAILED]: {
    origin: "inputs",
    summary: "A compare input file could not be read.",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.COMPARE_INPUT_JSON_SYNTAX]: {
    origin: "inputs",
    summary: "A compare input file is not valid JSON.",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.COMPARE_INPUT_SCHEMA_INVALID]: {
    origin: "inputs",
    summary: "A compare input file failed WorkflowResult schema validation.",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.COMPARE_WORKFLOW_TRUTH_MISMATCH]: {
    origin: "workflow_flow",
    summary: "Saved workflowTruthReport does not match recomputation from engine fields.",
    actionableCategory: "control_flow_problem",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.COMPARE_RUN_COMPARISON_REPORT_INVALID]: {
    origin: "workflow_flow",
    summary: "Run comparison report failed schema validation.",
    actionableCategory: "control_flow_problem",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.VERIFICATION_POLICY_INVALID]: {
    origin: "inputs",
    summary: "Verification policy arguments are invalid.",
    actionableCategory: "bad_input",
    actionableSeverity: "low",
  },
  [CLI_OPERATIONAL_CODES.EVENTUAL_MODE_NOT_SUPPORTED_IN_PROCESS_HOOK]: {
    origin: "workflow_flow",
    summary: "In-process verification does not support eventual consistency; use batch verifyWorkflow.",
    actionableCategory: "control_flow_problem",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.VALIDATE_REGISTRY_USAGE]: {
    origin: "workflow_flow",
    summary: "Invalid or incomplete arguments for validate-registry.",
    actionableCategory: "bad_input",
    actionableSeverity: "low",
  },
  [CLI_OPERATIONAL_CODES.EXECUTION_TRACE_USAGE]: {
    origin: "workflow_flow",
    summary: "Invalid or incomplete arguments for execution-trace.",
    actionableCategory: "bad_input",
    actionableSeverity: "low",
  },
  [CLI_OPERATIONAL_CODES.TRACE_DUPLICATE_RUN_EVENT_ID]: {
    origin: "workflow_flow",
    summary: "Duplicate runEventId in execution trace input.",
    actionableCategory: "control_flow_problem",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.TRACE_UNKNOWN_PARENT_RUN_EVENT_ID]: {
    origin: "workflow_flow",
    summary: "parentRunEventId does not reference a prior event.",
    actionableCategory: "control_flow_problem",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.TRACE_PARENT_FORWARD_REFERENCE]: {
    origin: "workflow_flow",
    summary: "parentRunEventId references an event that is not strictly earlier.",
    actionableCategory: "control_flow_problem",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.COMPARE_INPUT_RUN_LEVEL_INCONSISTENT]: {
    origin: "workflow_flow",
    summary: COMPARE_INPUT_RUN_LEVEL_INCONSISTENT_MESSAGE,
    actionableCategory: "control_flow_problem",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.WORKFLOW_RESULT_RUN_LEVEL_CODES_MISMATCH]: {
    origin: "workflow_flow",
    summary: WORKFLOW_RESULT_RUN_LEVEL_CODES_MISMATCH_MESSAGE,
    actionableCategory: "control_flow_problem",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.PLAN_TRANSITION_USAGE]: {
    origin: "inputs",
    summary: "Invalid or incomplete arguments for verify-workflow plan-transition.",
    actionableCategory: "bad_input",
    actionableSeverity: "low",
  },
  [CLI_OPERATIONAL_CODES.PLAN_TRANSITION_GIT_TOO_OLD]: {
    origin: "downstream_system_state",
    summary: "Git version is below the minimum required for plan-transition (2.30.0).",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.PLAN_TRANSITION_GIT_FAILED]: {
    origin: "downstream_system_state",
    summary: "Git command failed during plan-transition.",
    actionableCategory: "downstream_execution_failure",
    actionableSeverity: "high",
  },
  [CLI_OPERATIONAL_CODES.PLAN_TRANSITION_BAD_REF]: {
    origin: "inputs",
    summary: "Before or After ref could not be resolved to a commit.",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.PLAN_TRANSITION_GIT_PARSE]: {
    origin: "workflow_flow",
    summary: "git diff -z --name-status output could not be parsed.",
    actionableCategory: "control_flow_problem",
    actionableSeverity: "high",
  },
  [CLI_OPERATIONAL_CODES.PLAN_VALIDATION_NO_FRONT_MATTER]: {
    origin: "inputs",
    summary: "Plan.md is missing valid YAML front matter.",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.PLAN_VALIDATION_YAML_INVALID]: {
    origin: "inputs",
    summary:
      "YAML parse failed in Plan.md (YAML front matter or the body section \"Repository transition validation\").",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.PLAN_VALIDATION_SCHEMA_INVALID]: {
    origin: "inputs",
    summary:
      "planValidation rules failed JSON Schema validation (front matter key planValidation or body yaml fence under \"Repository transition validation\").",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.PLAN_VALIDATION_INSUFFICIENT_SPEC]: {
    origin: "inputs",
    summary:
      "Plan.md has no machine-checkable transition rules: add planValidation to YAML front matter, or add a single ## Repository transition validation section whose first fenced block is yaml/yml.",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.PLAN_VALIDATION_AMBIGUOUS_BODY_RULES]: {
    origin: "inputs",
    summary:
      "Plan.md body has duplicate \"Repository transition validation\" headings or multiple yaml/yml fences in that section.",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.PLAN_VALIDATION_INVALID_PATTERN]: {
    origin: "inputs",
    summary: "A glob pattern in planValidation.rules is invalid or unsafe.",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
  [CLI_OPERATIONAL_CODES.PLAN_PATH_OUTSIDE_REPO]: {
    origin: "inputs",
    summary: "--plan must resolve to a path inside --repo.",
    actionableCategory: "bad_input",
    actionableSeverity: "medium",
  },
} as const satisfies Record<OperationalCode, OperationalDispositionRow>;
