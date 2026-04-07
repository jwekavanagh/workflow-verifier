#!/usr/bin/env node
import { readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CLI_OPERATIONAL_CODES,
  cliErrorEnvelope,
  formatOperationalMessage,
} from "./failureCatalog.js";
import {
  buildRunComparisonReport,
  formatRunComparisonReport,
} from "./runComparison.js";
import { buildExecutionTraceView, formatExecutionTraceText } from "./executionTrace.js";
import { loadEventsForWorkflow } from "./loadEvents.js";
import { verifyWorkflow } from "./pipeline.js";
import {
  formatRegistryValidationHumanReport,
  validateToolsRegistry,
} from "./registryValidation.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import { TruthLayerError } from "./truthLayerError.js";
import type { VerificationPolicy, WorkflowEngineResult, WorkflowResult } from "./types.js";
import { resolveVerificationPolicyInput } from "./verificationPolicy.js";
import { normalizeToEmittedWorkflowResult } from "./workflowResultNormalize.js";
import {
  debugServerEntryUrl,
  loadCorpusBundle,
  logCorpusLoadErrors,
  startDebugServerOnPort,
} from "./debugServer.js";
import { writeAgentRunBundle } from "./agentRunBundle.js";
import {
  assertPlanPathInsideRepo,
  buildPlanTransitionEventsNdjson,
  buildPlanTransitionWorkflowResult,
  resolveCommitSha,
  sha256HexOfFile,
  type TransitionRulesProvenance,
} from "./planTransition.js";
import { PLAN_TRANSITION_WORKFLOW_ID } from "./planTransitionConstants.js";
import { COMPARE_INPUT_RUN_LEVEL_INCONSISTENT_MESSAGE } from "./runLevelDriftMessages.js";
import { isV9RunLevelCodesInconsistent } from "./workflowRunLevelConsistency.js";
import { formatWorkflowTruthReport } from "./workflowTruthReport.js";
import { workflowEngineResultFromEmitted } from "./workflowResultNormalize.js";

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}

function argValues(args: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name) {
      if (i + 1 >= args.length) break;
      out.push(args[i + 1]!);
      i++;
    }
  }
  return out;
}

function usageVerify(): string {
  return `Usage:
  verify-workflow --workflow-id <id> --events <path> --registry <path> --db <sqlitePath>
  verify-workflow --workflow-id <id> --events <path> --registry <path> --postgres-url <url>

Optional consistency (default strong):
  --consistency strong|eventual
  With eventual, required:
  --verification-window-ms <int>
  --poll-interval-ms <int>   (must be >= 1 and <= window)

With strong, do not pass --verification-window-ms or --poll-interval-ms.

Provide exactly one of --db or --postgres-url.

Optional output:
  --no-truth-report   For verdict exits 0–2, do not print the human truth report to stderr (stderr empty). stdout WorkflowResult JSON is unchanged. Exit 3 stderr is unchanged (single-line JSON envelope).
  --write-run-bundle <dir>   After a successful verify (schema-valid WorkflowResult), write a canonical run directory: events.ndjson (byte copy of --events), workflow-result.json (emitted result), agent-run.json (SHA-256 manifest). Directory is created if missing. Requires exit 0–2 (operational failure skips the write).

Exit codes:
  0  workflow status complete
  1  workflow status inconsistent
  2  workflow status incomplete
  3  operational failure (see stderr JSON)

  verify-workflow compare --prior <path> [--prior <path> ...] --current <path>
  Compare saved WorkflowResult JSON files (local only; see docs).

  verify-workflow validate-registry --registry <path>
  verify-workflow validate-registry --registry <path> --events <path> --workflow-id <id>
  Validate tools registry JSON (and optionally resolution vs events) without a database.
  See docs/execution-truth-layer.md (Registry validation).

  verify-workflow execution-trace --workflow-id <id> --events <path> [--workflow-result <path>] [--format json|text]
  Emit ExecutionTraceView JSON or text (see docs/execution-truth-layer.md).

  verify-workflow debug --corpus <dir> [--port <n>]
  Local Debug Console on 127.0.0.1 (see docs/execution-truth-layer.md — Debug Console).

  verify-workflow plan-transition --repo <dir> --before <ref> --after <ref> --plan <path>
  Validate git Before..After against machine plan rules (front matter planValidation or body section; Git >= 2.30.0; see docs).

  --help, -h  print this message and exit 0`;
}

function usageExecutionTrace(): string {
  return `Usage:
  verify-workflow execution-trace --workflow-id <id> --events <path> [--workflow-result <path>] [--format json|text]

Exit codes:
  0  success (stdout: ExecutionTraceView JSON or text; stderr empty)
  3  operational failure (stderr: JSON envelope only; stdout empty)

  --help, -h  print this message and exit 0`;
}

function assertExecutionTraceArgsWellFormed(args: string[]): void {
  const allowed = new Set([
    "--workflow-id",
    "--events",
    "--workflow-result",
    "--format",
    "--help",
    "-h",
  ]);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-h" || a === "--help") continue;
    if (!a.startsWith("--")) {
      throw new TruthLayerError(
        CLI_OPERATIONAL_CODES.EXECUTION_TRACE_USAGE,
        `Unexpected argument: ${a}`,
      );
    }
    if (!allowed.has(a)) {
      throw new TruthLayerError(
        CLI_OPERATIONAL_CODES.EXECUTION_TRACE_USAGE,
        `Unknown option: ${a}`,
      );
    }
    if (a === "--workflow-id" || a === "--events" || a === "--workflow-result" || a === "--format") {
      const v = args[i + 1];
      if (v === undefined || v.startsWith("--")) {
        throw new TruthLayerError(
          CLI_OPERATIONAL_CODES.EXECUTION_TRACE_USAGE,
          `Missing value after ${a}.`,
        );
      }
      i++;
    }
  }
}

function runExecutionTraceSubcommand(args: string[]): void {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usageExecutionTrace());
    process.exit(0);
  }

  try {
    assertExecutionTraceArgsWellFormed(args);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    throw e;
  }

  const workflowId = argValue(args, "--workflow-id");
  const eventsPath = argValue(args, "--events");
  const workflowResultPath = argValue(args, "--workflow-result");
  const formatRaw = argValue(args, "--format") ?? "json";
  if (formatRaw !== "json" && formatRaw !== "text") {
    writeCliError(
      CLI_OPERATIONAL_CODES.EXECUTION_TRACE_USAGE,
      '--format must be "json" or "text".',
    );
    process.exit(3);
  }

  if (!workflowId || !eventsPath) {
    writeCliError(
      CLI_OPERATIONAL_CODES.EXECUTION_TRACE_USAGE,
      "Missing required --workflow-id or --events path.",
    );
    process.exit(3);
  }

  let load;
  try {
    load = loadEventsForWorkflow(eventsPath, workflowId);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    process.exit(3);
  }

  let workflowResult: WorkflowResult | undefined;
  if (workflowResultPath) {
    let raw: string;
    try {
      raw = readFileSync(workflowResultPath, "utf8");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.COMPARE_INPUT_READ_FAILED, formatOperationalMessage(msg));
      process.exit(3);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.COMPARE_INPUT_JSON_SYNTAX, formatOperationalMessage(msg));
      process.exit(3);
    }
    try {
      workflowResult = normalizeToEmittedWorkflowResult(
        parsed as WorkflowEngineResult | WorkflowResult,
      );
    } catch (e) {
      if (e instanceof TruthLayerError) {
        writeCliError(e.code, e.message);
        process.exit(3);
      }
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
      process.exit(3);
    }
  }

  let view;
  try {
    view = buildExecutionTraceView({
      workflowId,
      runEvents: load.runEvents,
      malformedEventLineCount: load.malformedEventLineCount,
      workflowResult,
    });
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    process.exit(3);
  }

  const validateTrace = loadSchemaValidator("execution-trace-view");
  if (!validateTrace(view)) {
    writeCliError(
      CLI_OPERATIONAL_CODES.INTERNAL_ERROR,
      JSON.stringify(validateTrace.errors ?? []),
    );
    process.exit(3);
  }

  if (formatRaw === "text") {
    process.stdout.write(formatExecutionTraceText(view));
  } else {
    console.log(JSON.stringify(view));
  }
  process.exit(0);
}

function usageCompare(): string {
  return `Usage:
  verify-workflow compare --prior <workflowResult.json> [--prior <path> ...] --current <workflowResult.json>

Compares the current run (last file) against the immediate prior run (last --prior).
Recurrence uses all runs in order: each --prior in order, then --current.

Exit codes:
  0  comparison succeeded (stdout: RunComparisonReport JSON; stderr: human summary)
  3  operational failure (stderr: JSON envelope only; stdout empty)

  --help, -h  print this message and exit 0`;
}

function writeCliError(code: string, message: string): void {
  console.error(cliErrorEnvelope(code, message));
}

function readPackageIdentity(): { name: string; version: string } {
  const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const raw = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { name?: string; version?: string };
  const name = typeof pkg.name === "string" && pkg.name.length > 0 ? pkg.name : "execution-truth-layer";
  const version = typeof pkg.version === "string" && pkg.version.length > 0 ? pkg.version : "0.0.0";
  return { name, version };
}

function usageValidateRegistry(): string {
  return `Usage:
  verify-workflow validate-registry --registry <path>
  verify-workflow validate-registry --registry <path> --events <path> --workflow-id <id>

Exit codes:
  0  registry valid (stdout: RegistryValidationResult JSON; stderr empty)
  1  validation failed (stdout: RegistryValidationResult JSON; stderr human report)
  3  operational failure (stderr JSON envelope only; stdout empty)

Options: --registry (required), --events and --workflow-id (both or neither).

  --help, -h  print this message and exit 0`;
}

function assertValidateRegistryArgsWellFormed(args: string[]): void {
  const allowed = new Set(["--registry", "--events", "--workflow-id", "--help", "-h"]);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-h" || a === "--help") continue;
    if (!a.startsWith("--")) {
      throw new TruthLayerError(
        CLI_OPERATIONAL_CODES.VALIDATE_REGISTRY_USAGE,
        `Unexpected argument: ${a}`,
      );
    }
    if (!allowed.has(a)) {
      throw new TruthLayerError(
        CLI_OPERATIONAL_CODES.VALIDATE_REGISTRY_USAGE,
        `Unknown option: ${a}`,
      );
    }
    if (a === "--registry" || a === "--events" || a === "--workflow-id") {
      const v = args[i + 1];
      if (v === undefined || v.startsWith("--")) {
        throw new TruthLayerError(
          CLI_OPERATIONAL_CODES.VALIDATE_REGISTRY_USAGE,
          `Missing value after ${a}.`,
        );
      }
      i++;
    }
  }
}

function runValidateRegistrySubcommand(args: string[]): void {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usageValidateRegistry());
    process.exit(0);
  }

  try {
    assertValidateRegistryArgsWellFormed(args);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    throw e;
  }

  const registryPath = argValue(args, "--registry");
  const eventsPath = argValue(args, "--events");
  const workflowId = argValue(args, "--workflow-id");

  if (!registryPath) {
    writeCliError(
      CLI_OPERATIONAL_CODES.VALIDATE_REGISTRY_USAGE,
      "Missing required --registry path.",
    );
    process.exit(3);
  }

  let result;
  try {
    result = validateToolsRegistry({
      registryPath,
      eventsPath,
      workflowId,
    });
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    process.exit(3);
  }

  const validateOut = loadSchemaValidator("registry-validation-result");
  if (!validateOut(result)) {
    writeCliError(
      CLI_OPERATIONAL_CODES.INTERNAL_ERROR,
      JSON.stringify(validateOut.errors ?? []),
    );
    process.exit(3);
  }

  console.log(JSON.stringify(result));

  if (!result.valid) {
    process.stderr.write(`${formatRegistryValidationHumanReport(result)}\n`);
    process.exit(1);
  }

  process.exit(0);
}

function verificationPolicyFromCliArgs(args: string[]): VerificationPolicy {
  const mode = argValue(args, "--consistency") ?? "strong";
  if (mode !== "strong" && mode !== "eventual") {
    throw new TruthLayerError(CLI_OPERATIONAL_CODES.CLI_USAGE, "Invalid --consistency; use strong or eventual.");
  }
  const windowRaw = argValue(args, "--verification-window-ms");
  const pollRaw = argValue(args, "--poll-interval-ms");
  if (mode === "strong") {
    if (windowRaw !== undefined || pollRaw !== undefined) {
      throw new TruthLayerError(
        CLI_OPERATIONAL_CODES.CLI_USAGE,
        "strong consistency does not accept --verification-window-ms or --poll-interval-ms.",
      );
    }
    return resolveVerificationPolicyInput({ consistencyMode: "strong", verificationWindowMs: 0, pollIntervalMs: 0 });
  }
  if (windowRaw === undefined || pollRaw === undefined) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.CLI_USAGE,
      "eventual consistency requires --verification-window-ms and --poll-interval-ms.",
    );
  }
  const verificationWindowMs = Number(windowRaw);
  const pollIntervalMs = Number(pollRaw);
  return resolveVerificationPolicyInput({
    consistencyMode: "eventual",
    verificationWindowMs,
    pollIntervalMs,
  });
}

function runCompareSubcommand(args: string[]): void {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usageCompare());
    process.exit(0);
  }

  const priors = argValues(args, "--prior");
  const currentPath = argValue(args, "--current");

  if (priors.length < 1 || !currentPath) {
    writeCliError(
      CLI_OPERATIONAL_CODES.COMPARE_USAGE,
      "compare requires at least one --prior and --current.",
    );
    process.exit(3);
  }

  const paths = [...priors, currentPath];
  const validateCompareInput = loadSchemaValidator("workflow-result-compare-input");
  const results: WorkflowResult[] = [];
  const displayLabels: string[] = [];

  for (const filePath of paths) {
    displayLabels.push(path.basename(filePath));
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.COMPARE_INPUT_READ_FAILED, formatOperationalMessage(msg));
      process.exit(3);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.COMPARE_INPUT_JSON_SYNTAX, formatOperationalMessage(msg));
      process.exit(3);
    }
    if (isV9RunLevelCodesInconsistent(parsed)) {
      writeCliError(
        CLI_OPERATIONAL_CODES.COMPARE_INPUT_RUN_LEVEL_INCONSISTENT,
        COMPARE_INPUT_RUN_LEVEL_INCONSISTENT_MESSAGE,
      );
      process.exit(3);
    }
    if (!validateCompareInput(parsed)) {
      writeCliError(
        CLI_OPERATIONAL_CODES.COMPARE_INPUT_SCHEMA_INVALID,
        JSON.stringify(validateCompareInput.errors ?? []),
      );
      process.exit(3);
    }
    try {
      results.push(
        normalizeToEmittedWorkflowResult(parsed as WorkflowEngineResult | WorkflowResult),
      );
    } catch (e) {
      if (e instanceof TruthLayerError) {
        writeCliError(e.code, e.message);
        process.exit(3);
      }
      throw e;
    }
  }

  const wf0 = results[0]!.workflowId;
  for (const r of results) {
    if (r.workflowId !== wf0) {
      writeCliError(
        CLI_OPERATIONAL_CODES.COMPARE_WORKFLOW_ID_MISMATCH,
        "All WorkflowResult inputs must share the same workflowId.",
      );
      process.exit(3);
    }
  }

  let report;
  try {
    report = buildRunComparisonReport(results, displayLabels);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    process.exit(3);
  }

  const validateReport = loadSchemaValidator("run-comparison-report");
  if (!validateReport(report)) {
    writeCliError(
      CLI_OPERATIONAL_CODES.COMPARE_RUN_COMPARISON_REPORT_INVALID,
      JSON.stringify(validateReport.errors ?? []),
    );
    process.exit(3);
  }

  process.stderr.write(`${formatRunComparisonReport(report)}\n`);
  console.log(JSON.stringify(report));
  process.exit(0);
}

function usageDebug(): string {
  return `Usage:
  verify-workflow debug --corpus <dir> [--port <n>]

Serves the Debug Console on 127.0.0.1 only. Each run is a subfolder of the corpus
with workflow-result.json and events.ndjson (see docs/execution-truth-layer.md).

Exit: Ctrl+C ends the server (exit 0). Port in use or bad corpus → exit 3.

  --help, -h  print this message and exit 0`;
}

async function runDebugSubcommand(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usageDebug());
    process.exit(0);
  }
  const corpus = argValue(args, "--corpus");
  const portRaw = argValue(args, "--port");
  const port = portRaw === undefined ? 8787 : Number(portRaw);
  if (!corpus) {
    writeCliError(CLI_OPERATIONAL_CODES.CLI_USAGE, "debug requires --corpus <dir>.");
    process.exit(3);
  }
  if (!Number.isFinite(port) || port < 0 || port > 65535 || !Number.isInteger(port)) {
    writeCliError(CLI_OPERATIONAL_CODES.CLI_USAGE, "Invalid --port; use an integer 0–65535 (0 = ephemeral).");
    process.exit(3);
  }
  let st;
  try {
    st = statSync(corpus);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.CLI_USAGE, formatOperationalMessage(msg));
    process.exit(3);
  }
  if (!st.isDirectory()) {
    writeCliError(CLI_OPERATIONAL_CODES.CLI_USAGE, "--corpus must be a directory.");
    process.exit(3);
  }
  const resolved = path.resolve(corpus);
  const bundle = loadCorpusBundle(resolved);
  logCorpusLoadErrors(bundle.outcomes);
  let srv;
  try {
    srv = await startDebugServerOnPort(resolved, port);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    process.exit(3);
  }
  const url = debugServerEntryUrl(srv.port);
  process.stdout.write(`Debug Console ${url}\n`);
  process.stdout.write(`Corpus ${resolved} (${bundle.outcomes.length} run folders)\n`);
  const onSig = () => {
    void srv.close().then(() => process.exit(0));
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);
}

function usagePlanTransition(): string {
  return `Usage:
  verify-workflow plan-transition --repo <dir> --before <ref> --after <ref> --plan <path>

Optional:
  --workflow-id <id>   (default ${PLAN_TRANSITION_WORKFLOW_ID})
  --no-truth-report
  --write-run-bundle <dir>

Requires Git >= 2.30.0. Plan file must start with YAML front matter; rules from front matter planValidation or from a body section "Repository transition validation" (see docs).

Exit codes:
  0  workflow status complete
  1  workflow status inconsistent
  2  workflow status incomplete
  3  operational failure (see stderr JSON)

  --help, -h  print this message and exit 0`;
}

function runPlanTransitionSubcommand(args: string[]): void {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usagePlanTransition());
    process.exit(0);
  }
  const repo = argValue(args, "--repo");
  const beforeRef = argValue(args, "--before");
  const afterRef = argValue(args, "--after");
  const planPath = argValue(args, "--plan");
  if (!repo || !beforeRef || !afterRef || !planPath) {
    writeCliError(
      CLI_OPERATIONAL_CODES.PLAN_TRANSITION_USAGE,
      "plan-transition requires --repo, --before, --after, and --plan.",
    );
    process.exit(3);
  }
  const workflowId = argValue(args, "--workflow-id") ?? PLAN_TRANSITION_WORKFLOW_ID;
  const noTruthReport = args.includes("--no-truth-report");
  const writeRunBundleDir = argValue(args, "--write-run-bundle");

  let result: WorkflowResult;
  let transitionRulesProvenance: TransitionRulesProvenance;
  try {
    const built = buildPlanTransitionWorkflowResult({
      repoRoot: repo,
      beforeRef,
      afterRef,
      planPath,
      workflowId,
    });
    result = built.workflowResult;
    transitionRulesProvenance = built.transitionRulesProvenance;
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    throw e;
  }

  const validateResult = loadSchemaValidator("workflow-result");
  if (!validateResult(result)) {
    writeCliError(
      CLI_OPERATIONAL_CODES.WORKFLOW_RESULT_SCHEMA_INVALID,
      JSON.stringify(validateResult.errors ?? []),
    );
    process.exit(3);
  }

  if (!noTruthReport) {
    const engine = workflowEngineResultFromEmitted(result);
    process.stderr.write(`${formatWorkflowTruthReport(engine)}\n`);
  }

  if (writeRunBundleDir !== undefined) {
    try {
      const repoResolved = path.resolve(repo);
      const planReal = assertPlanPathInsideRepo(repoResolved, planPath);
      const beforeSha = resolveCommitSha(repoResolved, beforeRef);
      const afterSha = resolveCommitSha(repoResolved, afterRef);
      const planSha = sha256HexOfFile(planReal);
      const eventsNdjson = buildPlanTransitionEventsNdjson({
        workflowId,
        beforeRef,
        afterRef,
        beforeCommitSha: beforeSha,
        afterCommitSha: afterSha,
        planResolvedPath: planReal,
        planSha256: planSha,
        transitionRulesSource: transitionRulesProvenance,
      });
      writeAgentRunBundle({
        outDir: writeRunBundleDir,
        eventsNdjson,
        workflowResult: result,
        producer: readPackageIdentity(),
        verifiedAt: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
      process.exit(3);
    }
  }

  console.log(JSON.stringify(result));
  if (result.status === "complete") process.exit(0);
  if (result.status === "inconsistent") process.exit(1);
  process.exit(2);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "plan-transition") {
    runPlanTransitionSubcommand(args.slice(1));
    return;
  }
  if (args[0] === "debug") {
    await runDebugSubcommand(args.slice(1));
    return;
  }

  if (args[0] === "compare") {
    runCompareSubcommand(args.slice(1));
    return;
  }

  if (args[0] === "execution-trace") {
    runExecutionTraceSubcommand(args.slice(1));
    return;
  }

  if (args[0] === "validate-registry") {
    runValidateRegistrySubcommand(args.slice(1));
    return;
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(usageVerify());
    process.exit(0);
  }

  const workflowId = argValue(args, "--workflow-id");
  const eventsPath = argValue(args, "--events");
  const registryPath = argValue(args, "--registry");
  const dbPath = argValue(args, "--db");
  const postgresUrl = argValue(args, "--postgres-url");

  if (!workflowId || !eventsPath || !registryPath) {
    writeCliError(CLI_OPERATIONAL_CODES.CLI_USAGE, "Missing --workflow-id, --events, or --registry.");
    process.exit(3);
  }

  const dbCount = (dbPath ? 1 : 0) + (postgresUrl ? 1 : 0);
  if (dbCount !== 1) {
    writeCliError(
      CLI_OPERATIONAL_CODES.CLI_USAGE,
      "Provide exactly one of --db or --postgres-url.",
    );
    process.exit(3);
  }

  let verificationPolicy: VerificationPolicy;
  try {
    verificationPolicy = verificationPolicyFromCliArgs(args);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    throw e;
  }

  const noTruthReport = args.includes("--no-truth-report");
  const writeRunBundleDir = argValue(args, "--write-run-bundle");

  let result;
  try {
    result = await verifyWorkflow({
      workflowId,
      eventsPath,
      registryPath,
      database: postgresUrl
        ? { kind: "postgres", connectionString: postgresUrl }
        : { kind: "sqlite", path: dbPath! },
      verificationPolicy,
      ...(noTruthReport ? { truthReport: () => {} } : {}),
    });
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    process.exit(3);
  }

  const validateResult = loadSchemaValidator("workflow-result");
  if (!validateResult(result)) {
    writeCliError(
      CLI_OPERATIONAL_CODES.WORKFLOW_RESULT_SCHEMA_INVALID,
      JSON.stringify(validateResult.errors ?? []),
    );
    process.exit(3);
  }

  if (writeRunBundleDir !== undefined) {
    try {
      writeAgentRunBundle({
        outDir: writeRunBundleDir,
        eventsNdjson: readFileSync(path.resolve(eventsPath)),
        workflowResult: result,
        producer: readPackageIdentity(),
        verifiedAt: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
      process.exit(3);
    }
  }

  console.log(JSON.stringify(result));

  if (result.status === "complete") process.exit(0);
  if (result.status === "inconsistent") process.exit(1);
  process.exit(2);
}

void main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(cliErrorEnvelope(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg)));
  process.exit(3);
});
