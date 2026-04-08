import { readFileSync } from "fs";
import path from "path";
import {
  CLI_OPERATIONAL_CODES,
  cliErrorEnvelope,
  formatOperationalMessage,
} from "./failureCatalog.js";
import { verifyWorkflow } from "./pipeline.js";
import { runBatchVerifyToValidatedResult } from "./standardVerifyWorkflowCli.js";
import { TruthLayerError } from "./truthLayerError.js";
import { writeRunBundleCli, isBundlePrivateKeyTruthError } from "./writeRunBundleCli.js";
import { argValue, removeArgPair, parseBatchVerifyCliArgs, parseQuickCliArgs } from "./cliArgv.js";
import {
  workflowResultToCiLockV1,
  quickReportToCiLockV1,
  parseCiLockFromUtf8File,
  assertCiLockSchemaValid,
  ciLocksEqualStable,
} from "./ciLock.js";
import { stableStringify } from "./jsonStableStringify.js";
import { atomicWriteUtf8File } from "./quickVerify/atomicWrite.js";
import { runQuickVerifyToValidatedReport } from "./quickVerify/runQuickVerify.js";
import { formatQuickVerifyHumanReport } from "./quickVerify/formatQuickVerifyHumanReport.js";
import { buildQuickContractEventsNdjson } from "./quickVerify/buildQuickContractEventsNdjson.js";
import type { WorkflowResult } from "./types.js";

function writeCliError(code: string, message: string): void {
  console.error(cliErrorEnvelope(code, message));
}

function usageEnforce(): string {
  return `Usage:
  verify-workflow enforce batch (--expect-lock <path> | --output-lock <path>) <same flags as batch verify>
  verify-workflow enforce quick (--expect-lock <path> | --output-lock <path>) <same flags as quick>

Exactly one of --expect-lock or --output-lock is required.

Exit codes (batch): same as batch verify for 0–2; 3 operational; 4 lock mismatch (--expect-lock only).
Exit codes (quick): same as quick for 0–2; 3 operational; 4 lock mismatch (--expect-lock only).

See docs/ci-enforcement.md and docs/workflow-verifier.md.

  --help, -h  print this message and exit 0`;
}

function stripLockFlags(args: string[]): string[] {
  return removeArgPair(removeArgPair(args, "--expect-lock"), "--output-lock");
}

async function runEnforceBatch(restArgs: string[]): Promise<void> {
  const expectLock = argValue(restArgs, "--expect-lock");
  const outputLock = argValue(restArgs, "--output-lock");
  const hasExpect = expectLock !== undefined;
  const hasOutput = outputLock !== undefined;
  if (hasExpect === hasOutput) {
    writeCliError(
      CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
      "enforce batch requires exactly one of --expect-lock <path> or --output-lock <path>.",
    );
    process.exit(3);
  }

  let parsed;
  try {
    parsed = parseBatchVerifyCliArgs(stripLockFlags(restArgs));
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    throw e;
  }

  const runVerify = () =>
    verifyWorkflow({
      workflowId: parsed.workflowId,
      eventsPath: parsed.eventsPath,
      registryPath: parsed.registryPath,
      database: parsed.database,
      verificationPolicy: parsed.verificationPolicy,
      ...(parsed.noTruthReport ? { truthReport: () => {} } : {}),
    });

  let result: WorkflowResult;
  try {
    result = await runBatchVerifyToValidatedResult(runVerify);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    process.exit(3);
  }

  const actualLock = workflowResultToCiLockV1(result);
  assertCiLockSchemaValid(actualLock);

  if (hasOutput) {
    const outPath = path.resolve(outputLock!);
    try {
      atomicWriteUtf8File(outPath, stableStringify(actualLock) + "\n");
      parseCiLockFromUtf8File(outPath);
    } catch (e) {
      if (e instanceof TruthLayerError) {
        writeCliError(e.code, e.message);
        process.exit(3);
      }
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
      process.exit(3);
    }
  } else {
    let expected;
    try {
      expected = parseCiLockFromUtf8File(path.resolve(expectLock!));
    } catch (e) {
      if (e instanceof TruthLayerError) {
        writeCliError(e.code, e.message);
        process.exit(3);
      }
      throw e;
    }
    if (expected.kind !== "batch") {
      writeCliError(
        CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
        "--expect-lock file must be a batch ci-lock (kind=batch).",
      );
      process.exit(3);
    }
    if (!ciLocksEqualStable(actualLock, expected)) {
      console.log(JSON.stringify(result));
      writeCliError(
        CLI_OPERATIONAL_CODES.VERIFICATION_OUTPUT_LOCK_MISMATCH,
        "Lock fixture does not match verification output.",
      );
      process.exit(4);
    }
  }

  if (parsed.writeRunBundleDir !== undefined) {
    try {
      writeRunBundleCli(
        parsed.writeRunBundleDir,
        readFileSync(path.resolve(parsed.eventsPath)),
        result,
        parsed.signPrivateKeyPath,
      );
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

async function runEnforceQuick(restArgs: string[]): Promise<void> {
  const expectLock = argValue(restArgs, "--expect-lock");
  const outputLock = argValue(restArgs, "--output-lock");
  const hasExpect = expectLock !== undefined;
  const hasOutput = outputLock !== undefined;
  if (hasExpect === hasOutput) {
    writeCliError(
      CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
      "enforce quick requires exactly one of --expect-lock <path> or --output-lock <path>.",
    );
    process.exit(3);
  }

  let pq;
  try {
    pq = parseQuickCliArgs(stripLockFlags(restArgs));
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      process.exit(3);
    }
    throw e;
  }

  let inputUtf8: string;
  try {
    inputUtf8 = pq.inputPath === "-" ? readFileSync(0, "utf8") : readFileSync(path.resolve(pq.inputPath), "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.CLI_USAGE, `Cannot read --input: ${msg}`);
    process.exit(3);
  }

  let report;
  let registryUtf8: string;
  let contractExports: import("./quickVerify/buildQuickContractEventsNdjson.js").QuickContractExport[];
  try {
    const out = await runQuickVerifyToValidatedReport({
      inputUtf8,
      postgresUrl: pq.postgresUrl ?? undefined,
      sqlitePath: pq.dbPath ?? undefined,
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

  const actualLock = quickReportToCiLockV1(report);
  assertCiLockSchemaValid(actualLock);

  if (hasOutput) {
    const outPath = path.resolve(outputLock!);
    try {
      atomicWriteUtf8File(outPath, stableStringify(actualLock) + "\n");
      parseCiLockFromUtf8File(outPath);
    } catch (e) {
      if (e instanceof TruthLayerError) {
        writeCliError(e.code, e.message);
        process.exit(3);
      }
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
      process.exit(3);
    }
  } else {
    let expected;
    try {
      expected = parseCiLockFromUtf8File(path.resolve(expectLock!));
    } catch (e) {
      if (e instanceof TruthLayerError) {
        writeCliError(e.code, e.message);
        process.exit(3);
      }
      throw e;
    }
    if (expected.kind !== "quick") {
      writeCliError(
        CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
        "--expect-lock file must be a quick ci-lock (kind=quick).",
      );
      process.exit(3);
    }
    if (!ciLocksEqualStable(actualLock, expected)) {
      process.stdout.write(stableStringify(report) + "\n");
      const human = formatQuickVerifyHumanReport(report, {
        workflowId: pq.workflowIdQuick,
        eventsPath: pq.emitEventsPath !== undefined ? pq.emitEventsPath : undefined,
        registryPath: pq.exportPath,
        dbFlag: pq.dbPath ?? undefined,
        postgresUrl: pq.postgresUrl !== undefined,
      });
      console.error(human);
      writeCliError(
        CLI_OPERATIONAL_CODES.VERIFICATION_OUTPUT_LOCK_MISMATCH,
        "Lock fixture does not match verification output.",
      );
      process.exit(4);
    }
  }

  try {
    atomicWriteUtf8File(path.resolve(pq.exportPath), registryUtf8);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(`export-registry: ${msg}`));
    process.exit(3);
  }
  if (pq.emitEventsPath !== undefined) {
    const eventsUtf8 = buildQuickContractEventsNdjson({
      workflowId: pq.workflowIdQuick,
      exports: contractExports,
    });
    try {
      atomicWriteUtf8File(path.resolve(pq.emitEventsPath), eventsUtf8);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(`emit-events: ${msg}`));
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
  const human = formatQuickVerifyHumanReport(report, {
    workflowId: pq.workflowIdQuick,
    eventsPath: pq.emitEventsPath !== undefined ? pq.emitEventsPath : undefined,
    registryPath: pq.exportPath,
    dbFlag: pq.dbPath ?? undefined,
    postgresUrl: pq.postgresUrl !== undefined,
  });
  console.error(human);
  if (report.verdict === "pass") process.exit(0);
  if (report.verdict === "fail") process.exit(1);
  process.exit(2);
}

export async function runEnforce(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usageEnforce());
    process.exit(0);
  }
  const mode = args[0];
  if (mode === "batch") {
    await runEnforceBatch(args.slice(1));
    return;
  }
  if (mode === "quick") {
    await runEnforceQuick(args.slice(1));
    return;
  }
  writeCliError(
    CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
    'enforce requires "batch" or "quick" immediately after enforce.',
  );
  process.exit(3);
}
