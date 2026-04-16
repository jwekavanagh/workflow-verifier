/**
 * Batch/quick CI lock orchestration: R → VS → LOCK → VO → BC → JSON → footers → exit.
 * Normative telemetry ordering: docs/funnel-observability-ssot.md
 */
import { randomUUID } from "node:crypto";
import path from "path";
import {
  CLI_OPERATIONAL_CODES,
  cliErrorEnvelope,
  formatOperationalMessage,
} from "../failureCatalog.js";
import { TruthLayerError } from "../truthLayerError.js";
import { runLicensePreflightIfNeeded } from "../commercial/licensePreflight.js";
import { postVerifyOutcomeBeacon } from "../commercial/postVerifyOutcomeBeacon.js";
import { quickVerifyVerdictToTerminalStatus } from "../commercial/quickVerifyFunnelTerminalStatus.js";
import {
  classifyBatchVerifyWorkload,
  classifyQuickVerifyWorkload,
} from "../commercial/verifyWorkloadClassify.js";
import { LICENSE_PREFLIGHT_ENABLED } from "../generated/commercialBuildFlags.js";
import { argValue, parseBatchVerifyCliArgs, parseQuickCliArgs, removeArgPair } from "../cliArgv.js";
import type { ParsedBatchVerifyCli, ParsedQuickCli } from "../cliArgv.js";
import {
  executeBatchLockFromParsed,
  executeQuickLockFromParsed,
  parseBatchLockXorAndParsed,
  parseQuickLockXorAndParsed,
  type ParsedBatchLockRoute,
} from "../ciLockWorkflow.js";
import { emitVerifyWorkflowCliJsonAndExitByStatus } from "../standardVerifyWorkflowCli.js";
import { formatDistributionFooter } from "../distributionFooter.js";
import { maybeEmitOssClaimTicketUrlToStderr } from "../telemetry/maybeEmitOssClaimTicketUrl.js";
import { postProductActivationEvent } from "../telemetry/postProductActivationEvent.js";
import { stableStringify } from "../quickVerify/canonicalJson.js";
import { formatQuickVerifyHumanReport } from "../quickVerify/formatQuickVerifyHumanReport.js";
import type { QuickVerifyReport } from "../quickVerify/runQuickVerify.js";
import type { WorkflowResult } from "../types.js";

function writeCliError(code: string, message: string): void {
  console.error(cliErrorEnvelope(code, message));
}

/** OSS batch/quick: stderr when user passes --expect-lock (machine-checked). */
export const EXPECT_LOCK_REQUIRES_COMMERCIAL_BUILD_MESSAGE =
  "The OSS build supports --output-lock only; --expect-lock and agentskeptic enforce require the commercial build. Policy: docs/commercial-enforce-gate-normative.md";

/** Post-success stderr (monetized boundary); machine-checked literals. */
export const LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_A =
  "[agentskeptic] Paid compare and drift gates use agentskeptic enforce with --expect-lock (commercial).";
export const LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_B =
  "[agentskeptic] OSS verify can still emit --output-lock fixtures for CI without a subscription.";

export const ENFORCE_COMPARE_ONLY_REJECT_OUTPUT_LOCK_MESSAGE =
  "agentskeptic enforce is compare-only: use --expect-lock <path> against an existing lock; generate locks with batch or quick verify using --output-lock.";

function stderrWrite(s: string): void {
  process.stderr.write(s);
}

function emitMonetizedBoundaryFootersOnSuccess(): void {
  stderrWrite(`${LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_A}\n`);
  stderrWrite(`${LOCK_SUCCESS_MONETIZED_BOUNDARY_LINE_B}\n`);
}

function activationRunIdFromEnv(): string {
  return (
    process.env.AGENTSKEPTIC_RUN_ID?.trim() ||
    process.env.WORKFLOW_VERIFIER_RUN_ID?.trim() ||
    randomUUID()
  );
}

function terminalStatusFromWorkflowResult(r: WorkflowResult): "complete" | "inconsistent" | "incomplete" {
  if (r.status === "complete") return "complete";
  if (r.status === "inconsistent") return "inconsistent";
  return "incomplete";
}

/** @throws TruthLayerError — enforce batch: --expect-lock only (no --output-lock). */
export function parseEnforceBatchExpectLockRoute(restArgs: string[]): ParsedBatchLockRoute {
  if (argValue(restArgs, "--output-lock") !== undefined) {
    throw new TruthLayerError(CLI_OPERATIONAL_CODES.ENFORCE_USAGE, ENFORCE_COMPARE_ONLY_REJECT_OUTPUT_LOCK_MESSAGE);
  }
  const lockPath = argValue(restArgs, "--expect-lock");
  if (lockPath === undefined) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
      "enforce batch requires --expect-lock <path>.",
    );
  }
  const parsed = parseBatchVerifyCliArgs(removeArgPair(restArgs, "--expect-lock"));
  if (parsed.shareReportOrigin !== undefined) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
      "--share-report-origin is not supported with enforce batch.",
    );
  }
  return { parsed, lockKind: "expect", lockPath };
}

/** @throws TruthLayerError */
export function parseEnforceQuickExpectLockRoute(restArgs: string[]): { pq: ParsedQuickCli; lockPath: string } {
  if (argValue(restArgs, "--output-lock") !== undefined) {
    throw new TruthLayerError(CLI_OPERATIONAL_CODES.ENFORCE_USAGE, ENFORCE_COMPARE_ONLY_REJECT_OUTPUT_LOCK_MESSAGE);
  }
  const lockPath = argValue(restArgs, "--expect-lock");
  if (lockPath === undefined) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
      "enforce quick requires --expect-lock <path>.",
    );
  }
  const pq = parseQuickCliArgs(removeArgPair(restArgs, "--expect-lock"));
  if (pq.shareReportOrigin !== undefined) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
      "--share-report-origin is not supported with enforce quick.",
    );
  }
  return { pq, lockPath };
}

async function maybePostVerifyOutcomeAndBeaconBatch(input: {
  shouldEmit: boolean;
  runId: string | null;
  result: WorkflowResult;
  workloadClass: "bundled_examples" | "non_bundled";
  activationRunId: string;
  buildProfile: "oss" | "commercial";
  suppressOssClaim: boolean;
}): Promise<void> {
  if (!input.shouldEmit) return;
  const ts = terminalStatusFromWorkflowResult(input.result);
  await postProductActivationEvent({
    phase: "verify_outcome",
    run_id: input.activationRunId,
    issued_at: new Date().toISOString(),
    workload_class: input.workloadClass,
    subcommand: "batch_verify",
    build_profile: input.buildProfile,
    terminal_status: ts,
  });
  if (!input.suppressOssClaim) {
    await maybeEmitOssClaimTicketUrlToStderr({
      run_id: input.activationRunId,
      terminal_status: ts,
      workload_class: input.workloadClass,
      subcommand: "batch_verify",
      build_profile: input.buildProfile,
    });
  }
  if (LICENSE_PREFLIGHT_ENABLED && input.runId !== null) {
    await postVerifyOutcomeBeacon({
      runId: input.runId,
      terminal_status: ts,
      workload_class: input.workloadClass,
      subcommand: "batch_verify",
    });
  }
}

async function maybePostVerifyOutcomeAndBeaconQuick(input: {
  shouldEmit: boolean;
  runId: string | null;
  verdict: QuickVerifyReport["verdict"];
  workloadClass: "bundled_examples" | "non_bundled";
  activationRunId: string;
  buildProfile: "oss" | "commercial";
  suppressOssClaim: boolean;
}): Promise<void> {
  if (!input.shouldEmit) return;
  const ts = quickVerifyVerdictToTerminalStatus(input.verdict);
  await postProductActivationEvent({
    phase: "verify_outcome",
    run_id: input.activationRunId,
    issued_at: new Date().toISOString(),
    workload_class: input.workloadClass,
    subcommand: "quick_verify",
    build_profile: input.buildProfile,
    terminal_status: ts,
  });
  if (!input.suppressOssClaim) {
    await maybeEmitOssClaimTicketUrlToStderr({
      run_id: input.activationRunId,
      terminal_status: ts,
      workload_class: input.workloadClass,
      subcommand: "quick_verify",
      build_profile: input.buildProfile,
    });
  }
  if (LICENSE_PREFLIGHT_ENABLED && input.runId !== null) {
    await postVerifyOutcomeBeacon({
      runId: input.runId,
      terminal_status: ts,
      workload_class: input.workloadClass,
      subcommand: "quick_verify",
    });
  }
}

/**
 * `agentskeptic` batch entry when exactly one lock flag is present (verify CLI, not enforce).
 */
export async function orchestrateVerifyBatchLockRun(restArgs: string[]): Promise<void> {
  let route: ParsedBatchLockRoute;
  try {
    route = parseBatchLockXorAndParsed(restArgs);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    throw e;
  }

  if (route.lockKind === "expect" && !LICENSE_PREFLIGHT_ENABLED) {
    writeCliError(CLI_OPERATIONAL_CODES.ENFORCE_REQUIRES_COMMERCIAL_BUILD, EXPECT_LOCK_REQUIRES_COMMERCIAL_BUILD_MESSAGE);
    process.exit(3);
  }

  const activationRunId = activationRunIdFromEnv();
  let preflight = { runId: null as string | null };
  if (LICENSE_PREFLIGHT_ENABLED) {
    const intent = route.lockKind === "output" ? ("verify" as const) : ("enforce" as const);
    try {
      preflight = await runLicensePreflightIfNeeded(intent, { runId: activationRunId });
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

  const buildProfile = LICENSE_PREFLIGHT_ENABLED ? ("commercial" as const) : ("oss" as const);
  const workloadClass = classifyBatchVerifyWorkload({
    eventsPath: route.parsed.eventsPath,
    registryPath: route.parsed.registryPath,
    database: route.parsed.database,
  });
  const suppressOssClaim = route.parsed.noTruthReport || route.parsed.shareReportOrigin !== undefined;

  await postProductActivationEvent({
    phase: "verify_started",
    run_id: activationRunId,
    issued_at: new Date().toISOString(),
    workload_class: workloadClass,
    subcommand: "batch_verify",
    build_profile: buildProfile,
  });

  const truthReport =
    route.parsed.noTruthReport ?
      () => {}
    : (report: string) => {
        stderrWrite(`${report}\n`);
        stderrWrite(formatDistributionFooter());
      };

  const terminal = await executeBatchLockFromParsed({
    parsed: route.parsed,
    lockKind: route.lockKind,
    lockAbsolutePath: path.resolve(route.lockPath),
    truthReport,
  });

  const voBeaconEligible =
    terminal.tag === "workflow_terminal" ||
    terminal.tag === "lock_mismatch" ||
    (terminal.tag === "operational" && terminal.verifiedResult !== undefined);

  if (voBeaconEligible) {
    const resultForTelemetry =
      terminal.tag === "operational" ? terminal.verifiedResult! : terminal.result;
    await maybePostVerifyOutcomeAndBeaconBatch({
      shouldEmit: true,
      runId: preflight.runId,
      result: resultForTelemetry,
      workloadClass,
      activationRunId,
      buildProfile,
      suppressOssClaim,
    });
  }

  if (terminal.tag === "workflow_terminal") {
    emitVerifyWorkflowCliJsonAndExitByStatus(terminal.result, {
      consoleLog: (line) => {
        console.log(line);
      },
      exit: (code) => {
        if (code === 0) emitMonetizedBoundaryFootersOnSuccess();
        process.exit(code);
      },
    });
    return;
  }

  if (terminal.tag === "lock_mismatch") {
    emitVerifyWorkflowCliJsonAndExitByStatus(terminal.result, {
      consoleLog: (line) => {
        console.log(line);
      },
      exit: () => {
        /* no-op: we exit 4 below */
      },
    });
    writeCliError(
      CLI_OPERATIONAL_CODES.VERIFICATION_OUTPUT_LOCK_MISMATCH,
      "Lock fixture does not match verification output.",
    );
    process.exit(4);
  }

  writeCliError(terminal.envelope.code, terminal.envelope.message);
  process.exit(3);
}

/** `agentskeptic enforce batch` (commercial build only — caller gates OSS). */
export async function orchestrateEnforceBatchLockRun(restArgs: string[]): Promise<void> {
  let route: ParsedBatchLockRoute;
  try {
    route = parseEnforceBatchExpectLockRoute(restArgs);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    throw e;
  }

  const activationRunId = activationRunIdFromEnv();
  let preflight = { runId: null as string | null };
  try {
    preflight = await runLicensePreflightIfNeeded("enforce", { runId: activationRunId });
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    process.exit(3);
  }

  const workloadClass = classifyBatchVerifyWorkload({
    eventsPath: route.parsed.eventsPath,
    registryPath: route.parsed.registryPath,
    database: route.parsed.database,
  });
  const suppressOssClaim = route.parsed.noTruthReport || route.parsed.shareReportOrigin !== undefined;

  await postProductActivationEvent({
    phase: "verify_started",
    run_id: activationRunId,
    issued_at: new Date().toISOString(),
    workload_class: workloadClass,
    subcommand: "batch_verify",
    build_profile: "commercial",
  });

  const truthReport =
    route.parsed.noTruthReport ?
      () => {}
    : (report: string) => {
        stderrWrite(`${report}\n`);
        stderrWrite(formatDistributionFooter());
      };

  const terminal = await executeBatchLockFromParsed({
    parsed: route.parsed,
    lockKind: "expect",
    lockAbsolutePath: path.resolve(route.lockPath),
    truthReport,
  });

  const voBeaconEligible =
    terminal.tag === "workflow_terminal" ||
    terminal.tag === "lock_mismatch" ||
    (terminal.tag === "operational" && terminal.verifiedResult !== undefined);

  if (voBeaconEligible) {
    const resultForTelemetry =
      terminal.tag === "operational" ? terminal.verifiedResult! : terminal.result;
    await maybePostVerifyOutcomeAndBeaconBatch({
      shouldEmit: true,
      runId: preflight.runId,
      result: resultForTelemetry,
      workloadClass,
      activationRunId,
      buildProfile: "commercial",
      suppressOssClaim,
    });
  }

  if (terminal.tag === "workflow_terminal") {
    emitVerifyWorkflowCliJsonAndExitByStatus(terminal.result, {
      consoleLog: (line) => {
        console.log(line);
      },
      exit: (code) => {
        if (code === 0) emitMonetizedBoundaryFootersOnSuccess();
        process.exit(code);
      },
    });
    return;
  }

  if (terminal.tag === "lock_mismatch") {
    emitVerifyWorkflowCliJsonAndExitByStatus(terminal.result, {
      consoleLog: (line) => {
        console.log(line);
      },
      exit: () => {},
    });
    writeCliError(
      CLI_OPERATIONAL_CODES.VERIFICATION_OUTPUT_LOCK_MISMATCH,
      "Lock fixture does not match verification output.",
    );
    process.exit(4);
  }

  writeCliError(terminal.envelope.code, terminal.envelope.message);
  process.exit(3);
}

/** `agentskeptic quick` with exactly one lock flag. */
export async function orchestrateVerifyQuickLockRun(restArgs: string[]): Promise<void> {
  let route: ReturnType<typeof parseQuickLockXorAndParsed>;
  try {
    route = parseQuickLockXorAndParsed(restArgs);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    throw e;
  }

  if (route.lockKind === "expect" && !LICENSE_PREFLIGHT_ENABLED) {
    writeCliError(CLI_OPERATIONAL_CODES.ENFORCE_REQUIRES_COMMERCIAL_BUILD, EXPECT_LOCK_REQUIRES_COMMERCIAL_BUILD_MESSAGE);
    process.exit(3);
  }

  const activationRunId = activationRunIdFromEnv();
  let preflight = { runId: null as string | null };
  if (LICENSE_PREFLIGHT_ENABLED) {
    const intent = route.lockKind === "output" ? ("verify" as const) : ("enforce" as const);
    try {
      preflight = await runLicensePreflightIfNeeded(intent, { runId: activationRunId });
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

  const buildProfile = LICENSE_PREFLIGHT_ENABLED ? ("commercial" as const) : ("oss" as const);
  const workloadClass = classifyQuickVerifyWorkload({
    inputPath: route.pq.inputPath,
    sqlitePath: route.pq.dbPath ?? undefined,
    postgresUrl: route.pq.postgresUrl ?? undefined,
  });
  const suppressOssClaim = route.pq.shareReportOrigin !== undefined;

  await postProductActivationEvent({
    phase: "verify_started",
    run_id: activationRunId,
    issued_at: new Date().toISOString(),
    workload_class: workloadClass,
    subcommand: "quick_verify",
    build_profile: buildProfile,
  });

  const terminal = await executeQuickLockFromParsed({
    pq: route.pq,
    lockKind: route.lockKind,
    lockAbsolutePath: path.resolve(route.lockPath),
  });

  const voBeaconEligible =
    terminal.tag === "workflow_terminal" ||
    terminal.tag === "lock_mismatch" ||
    (terminal.tag === "operational" && terminal.verifiedOutcome !== undefined);

  if (voBeaconEligible) {
    const verdict =
      terminal.tag === "operational" ? terminal.verifiedOutcome!.report.verdict : terminal.report.verdict;
    await maybePostVerifyOutcomeAndBeaconQuick({
      shouldEmit: true,
      runId: preflight.runId,
      verdict,
      workloadClass,
      activationRunId,
      buildProfile,
      suppressOssClaim,
    });
  }

  if (terminal.tag === "workflow_terminal") {
    try {
      process.stdout.write(stableStringify(terminal.report) + "\n");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(`stdout: ${msg}`));
      process.exit(3);
    }
    const human = formatQuickVerifyHumanReport(terminal.report, {
      workflowId: terminal.pq.workflowIdQuick,
      eventsPath: terminal.pq.emitEventsPath !== undefined ? terminal.pq.emitEventsPath : undefined,
      registryPath: terminal.pq.exportPath,
      dbFlag: terminal.pq.dbPath ?? undefined,
      postgresUrl: terminal.pq.postgresUrl !== undefined,
    });
    console.error(human);
    stderrWrite(formatDistributionFooter());
    if (terminal.exitCode === 0) emitMonetizedBoundaryFootersOnSuccess();
    process.exit(terminal.exitCode);
  }

  if (terminal.tag === "lock_mismatch") {
    try {
      process.stdout.write(stableStringify(terminal.report) + "\n");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(`stdout: ${msg}`));
      process.exit(3);
    }
    const human = formatQuickVerifyHumanReport(terminal.report, {
      workflowId: terminal.pq.workflowIdQuick,
      eventsPath: terminal.pq.emitEventsPath !== undefined ? terminal.pq.emitEventsPath : undefined,
      registryPath: terminal.pq.exportPath,
      dbFlag: terminal.pq.dbPath ?? undefined,
      postgresUrl: terminal.pq.postgresUrl !== undefined,
    });
    console.error(human);
    writeCliError(
      CLI_OPERATIONAL_CODES.VERIFICATION_OUTPUT_LOCK_MISMATCH,
      "Lock fixture does not match verification output.",
    );
    process.exit(4);
  }

  writeCliError(terminal.envelope.code, terminal.envelope.message);
  process.exit(3);
}

/** `agentskeptic enforce quick` (commercial only). */
export async function orchestrateEnforceQuickLockRun(restArgs: string[]): Promise<void> {
  let route: { pq: ParsedQuickCli; lockPath: string };
  try {
    route = parseEnforceQuickExpectLockRoute(restArgs);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    throw e;
  }

  const activationRunId = activationRunIdFromEnv();
  let preflight = { runId: null as string | null };
  try {
    preflight = await runLicensePreflightIfNeeded("enforce", { runId: activationRunId });
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    process.exit(3);
  }

  const workloadClass = classifyQuickVerifyWorkload({
    inputPath: route.pq.inputPath,
    sqlitePath: route.pq.dbPath ?? undefined,
    postgresUrl: route.pq.postgresUrl ?? undefined,
  });
  const suppressOssClaim = route.pq.shareReportOrigin !== undefined;

  await postProductActivationEvent({
    phase: "verify_started",
    run_id: activationRunId,
    issued_at: new Date().toISOString(),
    workload_class: workloadClass,
    subcommand: "quick_verify",
    build_profile: "commercial",
  });

  const terminal = await executeQuickLockFromParsed({
    pq: route.pq,
    lockKind: "expect",
    lockAbsolutePath: path.resolve(route.lockPath),
  });

  const voBeaconEligible =
    terminal.tag === "workflow_terminal" ||
    terminal.tag === "lock_mismatch" ||
    (terminal.tag === "operational" && terminal.verifiedOutcome !== undefined);

  if (voBeaconEligible) {
    const verdict =
      terminal.tag === "operational" ? terminal.verifiedOutcome!.report.verdict : terminal.report.verdict;
    await maybePostVerifyOutcomeAndBeaconQuick({
      shouldEmit: true,
      runId: preflight.runId,
      verdict,
      workloadClass,
      activationRunId,
      buildProfile: "commercial",
      suppressOssClaim,
    });
  }

  if (terminal.tag === "workflow_terminal") {
    try {
      process.stdout.write(stableStringify(terminal.report) + "\n");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(`stdout: ${msg}`));
      process.exit(3);
    }
    const human = formatQuickVerifyHumanReport(terminal.report, {
      workflowId: terminal.pq.workflowIdQuick,
      eventsPath: terminal.pq.emitEventsPath !== undefined ? terminal.pq.emitEventsPath : undefined,
      registryPath: terminal.pq.exportPath,
      dbFlag: terminal.pq.dbPath ?? undefined,
      postgresUrl: terminal.pq.postgresUrl !== undefined,
    });
    console.error(human);
    stderrWrite(formatDistributionFooter());
    if (terminal.exitCode === 0) emitMonetizedBoundaryFootersOnSuccess();
    process.exit(terminal.exitCode);
  }

  if (terminal.tag === "lock_mismatch") {
    try {
      process.stdout.write(stableStringify(terminal.report) + "\n");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(`stdout: ${msg}`));
      process.exit(3);
    }
    const human = formatQuickVerifyHumanReport(terminal.report, {
      workflowId: terminal.pq.workflowIdQuick,
      eventsPath: terminal.pq.emitEventsPath !== undefined ? terminal.pq.emitEventsPath : undefined,
      registryPath: terminal.pq.exportPath,
      dbFlag: terminal.pq.dbPath ?? undefined,
      postgresUrl: terminal.pq.postgresUrl !== undefined,
    });
    console.error(human);
    writeCliError(
      CLI_OPERATIONAL_CODES.VERIFICATION_OUTPUT_LOCK_MISMATCH,
      "Lock fixture does not match verification output.",
    );
    process.exit(4);
  }

  writeCliError(terminal.envelope.code, terminal.envelope.message);
  process.exit(3);
}
