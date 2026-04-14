#!/usr/bin/env node
import { randomUUID } from "node:crypto";
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
import { argValue, argValues, parseBatchVerifyCliArgs, parseQuickCliArgs } from "./cliArgv.js";
import { ENFORCE_OSS_GATE_MESSAGE, runEnforce } from "./enforceCli.js";
import {
  CLI_EXITED_AFTER_ERROR,
  emitVerifyWorkflowCliJsonAndExitByStatus,
  runStandardVerifyWorkflowCliFlow,
  runStandardVerifyWorkflowCliToTerminalResult,
} from "./standardVerifyWorkflowCli.js";
import {
  formatRegistryValidationHumanReport,
  validateToolsRegistry,
} from "./registryValidation.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import { TruthLayerError } from "./truthLayerError.js";
import { verifyRunBundleSignature } from "./verifyRunBundleSignature.js";
import type { WorkflowEngineResult, WorkflowResult } from "./types.js";
import { isBundlePrivateKeyTruthError, writeRunBundleCli } from "./writeRunBundleCli.js";
import { normalizeToEmittedWorkflowResult } from "./workflowResultNormalize.js";
import {
  debugServerEntryUrl,
  loadCorpusBundle,
  logCorpusLoadErrors,
  startDebugServerOnPort,
} from "./debugServer.js";
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
import { atomicWriteUtf8File } from "./quickVerify/atomicWrite.js";
import { buildQuickContractEventsNdjson } from "./quickVerify/buildQuickContractEventsNdjson.js";
import { stableStringify } from "./quickVerify/canonicalJson.js";
import { formatQuickVerifyHumanReport } from "./quickVerify/formatQuickVerifyHumanReport.js";
import { runQuickVerifyToValidatedReport } from "./quickVerify/runQuickVerify.js";
import type { QuickVerifyReport } from "./quickVerify/runQuickVerify.js";
import type { QuickContractExport } from "./quickVerify/buildQuickContractEventsNdjson.js";
import { checkAssuranceReportStale } from "./assurance/checkStale.js";
import { runAssuranceFromManifest } from "./assurance/runAssurance.js";
import { runLicensePreflightIfNeeded } from "./commercial/licensePreflight.js";
import { postVerifyOutcomeBeacon } from "./commercial/postVerifyOutcomeBeacon.js";
import { quickVerifyVerdictToTerminalStatus } from "./commercial/quickVerifyFunnelTerminalStatus.js";
import {
  classifyBatchVerifyWorkload,
  classifyQuickVerifyWorkload,
} from "./commercial/verifyWorkloadClassify.js";
import { LICENSE_PREFLIGHT_ENABLED } from "./generated/commercialBuildFlags.js";
import { runBatchCiLockFromRestArgs, runQuickCiLockFromRestArgs } from "./ciLockWorkflow.js";
import { formatDistributionFooter } from "./distributionFooter.js";
import { postPublicVerificationReport } from "./shareReport/postPublicVerificationReport.js";
import { runBootstrapSubcommand } from "./bootstrap/runBootstrapSubcommand.js";
import { maybeEmitOssClaimTicketUrlToStderr } from "./telemetry/maybeEmitOssClaimTicketUrl.js";
import { postProductActivationEvent } from "./telemetry/postProductActivationEvent.js";

function usageQuick(): string {
  return `Usage:
  agentskeptic quick --input <path> (--postgres-url <url> | --db <sqlitePath>) --export-registry <path>
    [--emit-events <path>] [--workflow-id <id>] [--share-report-origin <https://host>]

  Input must contain structured tool activity (tool names and parameters extractable as JSON). Verification uses read-only SQL against the database you pass.

  Use - for stdin. Writes registry JSON array atomically, then optional events file, then stdout (see docs/quick-verify-normative.md).
  With --share-report-origin, human stderr is deferred until after a successful POST (same contract as batch verify; see docs/shareable-verification-reports.md).

Exit codes:
  0  verdict pass
  1  verdict fail
  2  verdict uncertain
  3  operational failure (stderr: JSON envelope)

  --help, -h  print this message and exit 0`;
}

function usageVerify(): string {
  return `Usage:
  agentskeptic quick --input <path> (--postgres-url <url> | --db <sqlitePath>) --export-registry <path> [--emit-events <path>] [--workflow-id <id>]
    (zero-config path; structured tool activity + read-only SQL; see docs/quick-verify-normative.md)

  agentskeptic bootstrap --input <path> (--db <sqlitePath> | --postgres-url <url>) --out <path>
    (BootstrapPackInput v1 JSON → contract pack + in-process verify; see docs/bootstrap-pack-normative.md)

  agentskeptic --workflow-id <id> --events <path> --registry <path> --db <sqlitePath>
  agentskeptic --workflow-id <id> --events <path> --registry <path> --postgres-url <url>

  Optional CI lock (commercial build; same as enforce batch): append exactly one of
  --output-lock <path> or --expect-lock <path> (requires active subscription; see docs/ci-enforcement.md).

Optional consistency (default strong):
  --consistency strong|eventual
  With eventual, required:
  --verification-window-ms <int>
  --poll-interval-ms <int>   (must be >= 1 and <= window)

With strong, do not pass --verification-window-ms or --poll-interval-ms.

Provide exactly one of --db or --postgres-url.

Optional output:
  --no-truth-report   For verdict exits 0–2, do not print the human truth report to stderr (stderr empty). stdout WorkflowResult JSON is unchanged. Exit 3 stderr is unchanged (single-line JSON envelope).
  --share-report-origin <https://host>   After successful verification, POST a shareable report to that origin (https only, origin with no path), then print human report + footer to stderr and WorkflowResult JSON to stdout. On POST failure: exit 3, stdout empty, stderr single-line JSON envelope (code SHARE_REPORT_FAILED). See docs/shareable-verification-reports.md.

Exit codes:
  0  workflow status complete
  1  workflow status inconsistent
  2  workflow status incomplete
  3  operational failure (see stderr JSON)
  4  CI lock mismatch with --expect-lock (stdout: WorkflowResult line; stderr: envelope after human report if any)

  agentskeptic compare --prior <path> [--prior <path> ...] --current <path>
  Compare saved WorkflowResult JSON files (local only; see docs).

  agentskeptic validate-registry --registry <path>
  agentskeptic validate-registry --registry <path> --events <path> --workflow-id <id>
  Validate tools registry JSON (and optionally resolution vs events) without a database.
  See docs/agentskeptic.md (Registry validation).

  agentskeptic execution-trace --workflow-id <id> --events <path> [--workflow-result <path>] [--format json|text]
  Emit ExecutionTraceView JSON or text (see docs/agentskeptic.md).

  agentskeptic enforce batch (--expect-lock <path> | --output-lock <path>) <same flags as batch verify>
  agentskeptic enforce quick (--expect-lock <path> | --output-lock <path>) <same flags as quick>
  CI enforcement with pinned ci-lock-v1 (see docs/ci-enforcement.md).

  agentskeptic assurance run --manifest <path> [--write-report <path>]
  agentskeptic assurance stale --report <path> --max-age-hours <n>
  Multi-scenario assurance sweep and staleness gate (see docs/agentskeptic.md).

Advanced / optional (persisted runs, signing, local UI, plan/git checks):
  --write-run-bundle <dir>   After a successful verify (schema-valid WorkflowResult), write a canonical run directory: events.ndjson (byte copy of --events), workflow-result.json (emitted result), agent-run.json (SHA-256 manifest). Directory is created if missing. Requires exit 0–2 (operational failure skips the write).
  --sign-ed25519-private-key <path>   With --write-run-bundle only: PKCS#8 PEM Ed25519 private key; also writes workflow-result.sig.json and manifest schemaVersion 2.

  verify-bundle-signature --run-dir <dir> --public-key <path>
  Verify signed bundle (Ed25519 + manifest v2). Exit 0 if valid; exit 3 with JSON envelope on failure.

  agentskeptic debug --corpus <dir> [--port <n>]
  Local Debug Console on 127.0.0.1 (see docs/agentskeptic.md — Debug Console).

  agentskeptic plan-transition --repo <dir> --before <ref> --after <ref> --plan <path>
  Validate git Before..After against machine plan rules (planValidation, body YAML section, or derived path citations as required diff surfaces; Git >= 2.30.0; see docs).

  --help, -h  print this message and exit 0`;
}

function usageExecutionTrace(): string {
  return `Usage:
  agentskeptic execution-trace --workflow-id <id> --events <path> [--workflow-result <path>] [--format json|text]

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
  agentskeptic compare --prior <workflowResult.json> [--prior <path> ...] --current <workflowResult.json>

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

function usageAssurance(): string {
  return `Usage:
  agentskeptic assurance run --manifest <path> [--write-report <path>]
  agentskeptic assurance stale --report <path> --max-age-hours <n>

  assurance run executes each manifest scenario by spawning this CLI (schemas/assurance-manifest-v1.schema.json).
  Path arguments in each scenario argv are resolved relative to the manifest file's directory unless absolute.

  assurance stale exits 1 when the report issuedAt is older than max-age-hours (UTC wall clock).

Exit codes (run):
  0  all scenarios exited 0
  1  at least one scenario non-zero
  3  operational failure (stderr: JSON envelope)

Exit codes (stale):
  0  report fresh
  1  report stale
  3  missing/invalid report (stderr: JSON envelope)

  --help, -h  print this message and exit 0`;
}

function runAssuranceSubcommand(args: string[]): void {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usageAssurance());
    process.exit(0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  if (sub === "run") {
    const manifestPath = argValue(rest, "--manifest");
    const writeReport = argValue(rest, "--write-report");
    if (!manifestPath) {
      writeCliError(
        CLI_OPERATIONAL_CODES.ASSURANCE_USAGE,
        "assurance run requires --manifest <path>.",
      );
      process.exit(3);
    }
    const res = runAssuranceFromManifest(path.resolve(manifestPath));
    if (!res.ok) {
      writeCliError(res.code, res.message);
      process.exit(3);
    }
    const line = `${JSON.stringify(res.report)}\n`;
    try {
      process.stdout.write(line);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(`stdout: ${msg}`));
      process.exit(3);
    }
    if (writeReport !== undefined) {
      try {
        atomicWriteUtf8File(path.resolve(writeReport), line);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        writeCliError(
          CLI_OPERATIONAL_CODES.INTERNAL_ERROR,
          formatOperationalMessage(`write-report: ${msg}`),
        );
        process.exit(3);
      }
    }
    process.exit(res.exitCode);
  }
  if (sub === "stale") {
    const reportPath = argValue(rest, "--report");
    const maxH = argValue(rest, "--max-age-hours");
    if (!reportPath || maxH === undefined) {
      writeCliError(
        CLI_OPERATIONAL_CODES.ASSURANCE_STALE_USAGE,
        "assurance stale requires --report <path> and --max-age-hours <n>.",
      );
      process.exit(3);
    }
    const hours = Number(maxH);
    if (!Number.isFinite(hours) || hours < 0) {
      writeCliError(
        CLI_OPERATIONAL_CODES.ASSURANCE_STALE_USAGE,
        "--max-age-hours must be a non-negative number.",
      );
      process.exit(3);
    }
    const st = checkAssuranceReportStale(path.resolve(reportPath), hours);
    if (st.kind === "operational") {
      writeCliError(st.code, st.message);
      process.exit(3);
    }
    if (st.kind === "stale") {
      process.stderr.write("AssuranceRunReport issuedAt is older than --max-age-hours.\n");
      process.exit(1);
    }
    process.exit(0);
  }
  writeCliError(
    CLI_OPERATIONAL_CODES.ASSURANCE_USAGE,
    "Use agentskeptic assurance run or agentskeptic assurance stale.",
  );
  process.exit(3);
}

async function runQuickSubcommand(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usageQuick());
    process.exit(0);
  }
  const expectLockQ = argValue(args, "--expect-lock");
  const outputLockQ = argValue(args, "--output-lock");
  const hasExpectQ = expectLockQ !== undefined;
  const hasOutputQ = outputLockQ !== undefined;
  if (hasExpectQ && hasOutputQ) {
    writeCliError(
      CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
      "quick requires exactly one of --expect-lock <path> or --output-lock <path>.",
    );
    process.exit(3);
  }
  if (hasExpectQ !== hasOutputQ) {
    if (!LICENSE_PREFLIGHT_ENABLED) {
      writeCliError(
        CLI_OPERATIONAL_CODES.ENFORCE_REQUIRES_COMMERCIAL_BUILD,
        `${ENFORCE_OSS_GATE_MESSAGE} --output-lock/--expect-lock on quick requires the commercial build.`,
      );
      process.exit(3);
    }
    try {
      await runLicensePreflightIfNeeded("enforce");
    } catch (e) {
      if (e instanceof TruthLayerError) {
        writeCliError(e.code, e.message);
        process.exit(3);
      }
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
      process.exit(3);
    }
    await runQuickCiLockFromRestArgs(args);
    return;
  }
  let pq;
  try {
    pq = parseQuickCliArgs(args);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    throw e;
  }
  const { inputPath, exportPath, emitEventsPath, workflowIdQuick, dbPath, postgresUrl, shareReportOrigin } = pq;
  const activationRunId =
    process.env.AGENTSKEPTIC_RUN_ID?.trim() ||
    process.env.WORKFLOW_VERIFIER_RUN_ID?.trim() ||
    randomUUID();
  let quickPreflight: { runId: string | null };
  try {
    quickPreflight = await runLicensePreflightIfNeeded("verify", { runId: activationRunId });
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    process.exit(3);
  }
  let inputUtf8: string;
  try {
    inputUtf8 = inputPath === "-" ? readFileSync(0, "utf8") : readFileSync(path.resolve(inputPath), "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.CLI_USAGE, `Cannot read --input: ${msg}`);
    process.exit(3);
  }
  const quickBuildProfile = LICENSE_PREFLIGHT_ENABLED ? ("commercial" as const) : ("oss" as const);
  const quickWorkloadClass = classifyQuickVerifyWorkload({
    inputPath: inputPath,
    sqlitePath: dbPath ?? undefined,
    postgresUrl: postgresUrl ?? undefined,
  });
  await postProductActivationEvent({
    phase: "verify_started",
    run_id: activationRunId,
    issued_at: new Date().toISOString(),
    workload_class: quickWorkloadClass,
    subcommand: "quick_verify",
    build_profile: quickBuildProfile,
  });
  let registryUtf8: string;
  let report: QuickVerifyReport;
  let contractExports: QuickContractExport[] = [];
  try {
    const out = await runQuickVerifyToValidatedReport({
      inputUtf8,
      postgresUrl: postgresUrl ?? undefined,
      sqlitePath: dbPath ?? undefined,
    });
    report = out.report;
    registryUtf8 = out.registryUtf8;
    contractExports = out.contractExports;
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    process.exit(3);
  }
  await postProductActivationEvent({
    phase: "verify_outcome",
    run_id: activationRunId,
    issued_at: new Date().toISOString(),
    workload_class: quickWorkloadClass,
    subcommand: "quick_verify",
    build_profile: quickBuildProfile,
    terminal_status: quickVerifyVerdictToTerminalStatus(report.verdict),
  });
  try {
    atomicWriteUtf8File(path.resolve(exportPath), registryUtf8);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(`export-registry: ${msg}`));
    process.exit(3);
  }
  if (emitEventsPath !== undefined) {
    const eventsUtf8 = buildQuickContractEventsNdjson({
      workflowId: workflowIdQuick,
      exports: contractExports,
    });
    try {
      atomicWriteUtf8File(path.resolve(emitEventsPath), eventsUtf8);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(`emit-events: ${msg}`));
      process.exit(3);
    }
  }
  const human = formatQuickVerifyHumanReport(report, {
    workflowId: workflowIdQuick,
    eventsPath: emitEventsPath !== undefined ? emitEventsPath : undefined,
    registryPath: exportPath,
    dbFlag: dbPath ?? undefined,
    postgresUrl: postgresUrl !== undefined,
  });
  if (shareReportOrigin !== undefined) {
    const shareRes = await postPublicVerificationReport(shareReportOrigin, {
      schemaVersion: 1,
      kind: "quick",
      workflowDisplayId: workflowIdQuick,
      quickReport: report,
      humanReportText: human,
    });
    if (!shareRes.ok) {
      writeCliError(
        CLI_OPERATIONAL_CODES.SHARE_REPORT_FAILED,
        formatOperationalMessage(
          `share_report_origin=${shareReportOrigin} http_status=${String(shareRes.status)} detail=${shareRes.bodySnippet}`,
        ),
      );
      process.exit(3);
    }
  }
  try {
    process.stdout.write(stableStringify(report) + "\n");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(`stdout: ${msg}`));
    process.exit(3);
  }
  console.error(human);
  process.stderr.write(formatDistributionFooter());
  await maybeEmitOssClaimTicketUrlToStderr({
    run_id: activationRunId,
    terminal_status: quickVerifyVerdictToTerminalStatus(report.verdict),
    workload_class: quickWorkloadClass,
    subcommand: "quick_verify",
    build_profile: quickBuildProfile,
  });
  await postVerifyOutcomeBeacon({
    runId: quickPreflight.runId,
    terminal_status: quickVerifyVerdictToTerminalStatus(report.verdict),
    workload_class: quickWorkloadClass,
    subcommand: "quick_verify",
  });
  if (report.verdict === "pass") process.exit(0);
  if (report.verdict === "fail") process.exit(1);
  process.exit(2);
}

function runVerifyBundleSignatureSubcommand(args: string[]): void {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage:
  agentskeptic verify-bundle-signature --run-dir <dir> --public-key <path>

Exit codes:
  0  signature and manifest integrity OK
  3  verification failed (stderr: JSON envelope; code is BUNDLE_SIGNATURE_*)

  --help, -h  print this message and exit 0`);
    process.exit(0);
  }
  const runDir = argValue(args, "--run-dir");
  const publicKeyPath = argValue(args, "--public-key");
  if (!runDir || !publicKeyPath) {
    writeCliError(
      CLI_OPERATIONAL_CODES.CLI_USAGE,
      "verify-bundle-signature requires --run-dir and --public-key.",
    );
    process.exit(3);
  }
  const r = verifyRunBundleSignature(runDir, publicKeyPath);
  if (r.ok) {
    process.exit(0);
  }
  writeCliError(r.code, r.message);
  process.exit(3);
}

function usageValidateRegistry(): string {
  return `Usage:
  agentskeptic validate-registry --registry <path>
  agentskeptic validate-registry --registry <path> --events <path> --workflow-id <id>

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
  agentskeptic debug --corpus <dir> [--port <n>]

Serves the Debug Console on 127.0.0.1 only. Each run is a subfolder of the corpus
with workflow-result.json and events.ndjson (see docs/agentskeptic.md).

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
  agentskeptic plan-transition --repo <dir> --before <ref> --after <ref> --plan <path>

Optional:
  --workflow-id <id>   (default ${PLAN_TRANSITION_WORKFLOW_ID})
  --no-truth-report
  --write-run-bundle <dir>
  --sign-ed25519-private-key <path>   (requires --write-run-bundle)

Requires Git >= 2.30.0. Plan file must start with YAML front matter; rules from front matter planValidation, or from a body section "Repository transition validation", or derived from path citations as required diff surfaces when neither is present (see docs).

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
  const signPrivateKeyPath = argValue(args, "--sign-ed25519-private-key");
  if (signPrivateKeyPath !== undefined && writeRunBundleDir === undefined) {
    writeCliError(
      CLI_OPERATIONAL_CODES.CLI_USAGE,
      "--sign-ed25519-private-key requires --write-run-bundle.",
    );
    process.exit(3);
  }

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
      writeRunBundleCli(writeRunBundleDir, eventsNdjson, result, signPrivateKeyPath);
    } catch (e) {
      if (isBundlePrivateKeyTruthError(e)) {
        writeCliError(e.code, e.message);
        process.exit(3);
      }
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
  if (args[0] === "assurance") {
    runAssuranceSubcommand(args.slice(1));
    return;
  }
  if (args[0] === "quick") {
    await runQuickSubcommand(args.slice(1));
    return;
  }
  if (args[0] === "bootstrap") {
    await runBootstrapSubcommand(args.slice(1));
    return;
  }
  if (args[0] === "verify-bundle-signature") {
    runVerifyBundleSignatureSubcommand(args.slice(1));
    return;
  }
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

  if (args[0] === "enforce") {
    await runEnforce(args.slice(1));
    return;
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(usageVerify());
    process.exit(0);
  }

  const expectLockB = argValue(args, "--expect-lock");
  const outputLockB = argValue(args, "--output-lock");
  const hasExpectB = expectLockB !== undefined;
  const hasOutputB = outputLockB !== undefined;
  if (hasExpectB && hasOutputB) {
    writeCliError(
      CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
      "batch verify requires exactly one of --expect-lock <path> or --output-lock <path>.",
    );
    process.exit(3);
  }
  if (hasExpectB !== hasOutputB) {
    if (!LICENSE_PREFLIGHT_ENABLED) {
      writeCliError(
        CLI_OPERATIONAL_CODES.ENFORCE_REQUIRES_COMMERCIAL_BUILD,
        `${ENFORCE_OSS_GATE_MESSAGE} --output-lock/--expect-lock on batch verify requires the commercial build.`,
      );
      process.exit(3);
    }
    try {
      await runLicensePreflightIfNeeded("enforce");
    } catch (e) {
      if (e instanceof TruthLayerError) {
        writeCliError(e.code, e.message);
        process.exit(3);
      }
      throw e;
    }
    await runBatchCiLockFromRestArgs(args);
    return;
  }

  let parsedBatch;
  try {
    parsedBatch = parseBatchVerifyCliArgs(args);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    throw e;
  }

  const batchActivationRunId =
    process.env.AGENTSKEPTIC_RUN_ID?.trim() ||
    process.env.WORKFLOW_VERIFIER_RUN_ID?.trim() ||
    randomUUID();
  let batchPreflight: { runId: string | null };
  try {
    batchPreflight = await runLicensePreflightIfNeeded("verify", { runId: batchActivationRunId });
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    throw e;
  }

  const suppressTruthToStderr = parsedBatch.noTruthReport || parsedBatch.shareReportOrigin !== undefined;
  const batchBuildProfile = LICENSE_PREFLIGHT_ENABLED ? ("commercial" as const) : ("oss" as const);
  const batchWorkloadClass = classifyBatchVerifyWorkload({
    eventsPath: parsedBatch.eventsPath,
    registryPath: parsedBatch.registryPath,
    database: parsedBatch.database,
  });
  await postProductActivationEvent({
    phase: "verify_started",
    run_id: batchActivationRunId,
    issued_at: new Date().toISOString(),
    workload_class: batchWorkloadClass,
    subcommand: "batch_verify",
    build_profile: batchBuildProfile,
  });
  const batchIo = {
    consoleLog: (line: string) => {
      console.log(line);
    },
    stderrLine: (line: string) => {
      console.error(line);
    },
    exit: (code: number) => {
      process.exit(code);
    },
  };
  try {
    const result = await runStandardVerifyWorkflowCliToTerminalResult({
      shareReportOrigin: parsedBatch.shareReportOrigin,
      runVerify: () =>
        verifyWorkflow({
          workflowId: parsedBatch.workflowId,
          eventsPath: parsedBatch.eventsPath,
          registryPath: parsedBatch.registryPath,
          database: parsedBatch.database,
          verificationPolicy: parsedBatch.verificationPolicy,
          ...(suppressTruthToStderr ?
            { truthReport: () => {} }
          : {
              truthReport: (report: string) => {
                process.stderr.write(`${report}\n`);
                process.stderr.write(formatDistributionFooter());
              },
            }),
        }),
      maybeWriteBundle:
        parsedBatch.writeRunBundleDir === undefined
          ? undefined
          : (wfResult: WorkflowResult) =>
              writeRunBundleCli(
                parsedBatch.writeRunBundleDir!,
                readFileSync(path.resolve(parsedBatch.eventsPath)),
                wfResult,
                parsedBatch.signPrivateKeyPath,
              ),
      io: batchIo,
    });
    await postProductActivationEvent({
      phase: "verify_outcome",
      run_id: batchActivationRunId,
      issued_at: new Date().toISOString(),
      workload_class: batchWorkloadClass,
      subcommand: "batch_verify",
      build_profile: batchBuildProfile,
      terminal_status: result.status,
    });
    await maybeEmitOssClaimTicketUrlToStderr({
      run_id: batchActivationRunId,
      terminal_status: result.status,
      workload_class: batchWorkloadClass,
      subcommand: "batch_verify",
      build_profile: batchBuildProfile,
    });
    await postVerifyOutcomeBeacon({
      runId: batchPreflight.runId,
      terminal_status: result.status,
      workload_class: batchWorkloadClass,
      subcommand: "batch_verify",
    });
    emitVerifyWorkflowCliJsonAndExitByStatus(result, batchIo);
  } catch (e) {
    if (e instanceof Error && e.message === CLI_EXITED_AFTER_ERROR) return;
    throw e;
  }
}

void main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(cliErrorEnvelope(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg)));
  process.exit(3);
});
