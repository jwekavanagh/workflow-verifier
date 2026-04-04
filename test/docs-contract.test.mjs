import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const REQUIRED = [
  "### Low-friction integration (in-process)",
  "### Batch and CLI (replay)",
  "### Human truth report",
  "### Engineer note: shared step core",
  "### Operator",
  "### Retry and repeated seq",
  "planLogicalSteps.ts",
  "canonicalJsonForParams",
  "RETRY_OBSERVATIONS_DIVERGE",
  "await withWorkflowVerification",
  "observeStep",
  "**`observeStep` return:** Always **`undefined`**",
  "Workflow verification observeStep invoked after workflow run completed",
  "MALFORMED_EVENT_LINE",
  "strings and primitives are not parsed as NDJSON",
  "example:workflow-hook",
  "One root boundary; library owns DB close in finally; avoids silent leaks when integrators omit a terminal call.",
  "Same event contract for CI and external logs without requiring in-process wrapper.",
  "reconcileFromRows` in `reconciler.ts` is the single rule table.",
  "### CI workflow truth contract (Postgres CLI)",
  "--no-truth-report",
  "ci-workflow-truth-postgres-contract.test.mjs",
  "test:workflow-truth-contract",
  "### Postgres verification (batch and CLI)",
  "`withWorkflowVerification` is SQLite-only",
  "applyPostgresVerificationSessionGuards",
  "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY",
  "readonly_probe",
  "POSTGRES_VERIFICATION_URL",
  "POSTGRES_ADMIN_URL",
  "redact params in retained logs",
  "truthReport",
  "formatWorkflowTruthReport",
  "HUMAN_REPORT_RESULT_PHRASE",
  "STEP_STATUS_TRUTH_LABELS",
  "reference_code:",
  "result=",
  "workflow_id:",
  "workflow_status:",
  "run_level:",
  "steps:",
  "status=",
  "observations: evaluated=",
  "in_capture_order",
  "TRUSTED: Every step matched the database under the configured verification rules.",
  "NOT TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.",
  "NOT TRUSTED: At least one step failed verification against the database (determinate failure).",
  "Event line was missing, invalid JSON, or failed schema validation for a tool observation.",
  "### CLI operational errors",
  "execution_truth_layer_error",
  "runLevelReasons",
  "NO_STEPS_FOR_WORKFLOW",
  "failureCatalog.ts",
  "STRING_SPEC_POINTER_MISSING",
  "For the CLI, a **human-readable verification report** is written to **stderr**",
  "docs/execution-truth-layer.md#human-truth-report",
  "Reading logs:",
  "`schemaVersion` **`8`**",
  "workflow-truth-report.schema.json",
  "workflow-engine-result.schema.json",
  "workflow-result-compare-input.schema.json",
  "COMPARE_WORKFLOW_TRUTH_MISMATCH",
  "workflowTruthReport",
  "failureDiagnostic",
  "actionableFailure.ts",
  "### Actionable failure classification (normative)",
  "actionable_failure:",
  "unknownReasonCodes",
  "verificationDiagnostics.ts",
  "category:",
  "verify_target:",
  "eventSequenceIntegrity",
  "event_sequence:",
  "prepareWorkflowEvents.ts",
  "eventSequenceIntegrity.ts",
  "## Event capture order and delayed delivery (normative)",
  "TRUST_LINE_EVENT_SEQUENCE_IRREGULAR_SUFFIX",
  "EVENT_SEQUENCE_MESSAGES",
  "Verification policy (normative)",
  "verificationPolicy",
  "UNCERTAIN_NOT_OBSERVED_WITHIN_WINDOW",
  "VERIFICATION_POLICY_INVALID",
  "EVENTUAL_MODE_NOT_SUPPORTED_IN_PROCESS_HOOK",
  "repeatObservationCount",
  "PARTIALLY_VERIFIED",
  "partially_verified",
  "`sql_effects`",
  "multiEffectRollup.ts",
  "Workflow result: multi-effect shape",
  "DUPLICATE_EFFECT_ID",
  "effect: id=",
  "## Cross-run comparison (normative)",
  "### Cross-run comparison: implementation bindings (normative)",
  "verify-workflow compare",
  "runComparison.ts",
  "buildRunComparisonReport",
  "cross-run-comparison-normative",
  "COMPARE_WORKFLOW_ID_MISMATCH",
  "## Registry validation (`validate-registry`) — normative",
  "Registry validation failed:",
  "VALIDATE_REGISTRY_USAGE",
  "registry-validation-result.schema.json",
  "validate-registry",
  "examples/templates/",
  "validateToolsRegistry",
  "## The problem (and cost of ignoring it)",
  "## Is this for you?",
  "## How this differs from logs, tests, and observability",
  "## End-to-end execution visibility (normative)",
  "execution-trace-view.schema.json",
  "buildExecutionTraceView",
  "runEvents",
  "verify-workflow execution-trace",
  "TRACE_DUPLICATE_RUN_EVENT_ID",
  "ExecutionTraceView",
  "executionTrace.ts",
  "EXECUTION_TRACE_USAGE",
  "TRACE_UNKNOWN_PARENT_RUN_EVENT_ID",
  "TRACE_PARENT_FORWARD_REFERENCE",
  "## Debug Console (normative)",
  "verify-workflow debug",
  "CORPUS_TOO_LARGE",
  "MISSING_EVENTS",
  "PATH_ESCAPE",
  "WORKFLOW_RESULT_JSON",
  "debugCorpus.ts",
  "debugServer.ts",
  "debugFocus.ts",
  "debugPatterns.ts",
  "GET /api/corpus-patterns",
  "includeLoadErrors",
  "__unspecified__",
  "PATTERNS_COMPARE_TOO_MANY",
  "buildFocusTargets",
  "examples/debug-corpus/",
];

describe("docs contract (SSOT + README)", () => {
  it("contains all pinned substrings", () => {
    const ssot = readFileSync(join(root, "docs", "execution-truth-layer.md"), "utf8");
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const bundle = `${ssot}\n${readme}`;
    for (const s of REQUIRED) {
      assert.ok(bundle.includes(s), `missing substring: ${s.slice(0, 60)}…`);
    }
  });

  it("README above-the-fold covers visitor outcomes (problem, persona, differentiation, try path)", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const head = readme.slice(0, 5500);
    assert.ok(
      head.includes("## The problem (and cost of ignoring it)"),
      "problem section in first screen",
    );
    assert.ok(head.includes("## Is this for you?"), "persona section in first screen");
    assert.ok(
      head.includes("## How this differs from logs, tests, and observability"),
      "differentiation section in first screen",
    );
    assert.ok(head.includes("## Try it in under five minutes"), "fast try path before deep CI");
    assert.ok(
      /If you ignore that gap/i.test(head) && /cost/i.test(head),
      "cost of inaction stated in prose",
    );
    assert.ok(
      /This is for you if/i.test(head) && /This is not for you if/i.test(head),
      "self-identification lists",
    );
  });
});
