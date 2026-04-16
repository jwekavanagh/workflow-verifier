/**
 * Shared batch/quick verification + ci-lock-v1 write/compare (no license preflight).
 * Callers run reserve / product-activation in src/cli/lockOrchestration.ts.
 */
import { readFileSync } from "fs";
import path from "path";
import { CLI_OPERATIONAL_CODES, formatOperationalMessage } from "./failureCatalog.js";
import { verifyWorkflow } from "./pipeline.js";
import { runBatchVerifyToValidatedResult } from "./standardVerifyWorkflowCli.js";
import { TruthLayerError } from "./truthLayerError.js";
import { writeRunBundleCli, isBundlePrivateKeyTruthError } from "./writeRunBundleCli.js";
import { argValue, removeArgPair, parseBatchVerifyCliArgs, parseQuickCliArgs } from "./cliArgv.js";
import type { ParsedBatchVerifyCli, ParsedQuickCli } from "./cliArgv.js";
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
import type { QuickVerifyReport } from "./quickVerify/runQuickVerify.js";
import type { QuickContractExport } from "./quickVerify/buildQuickContractEventsNdjson.js";
import type { WorkflowResult } from "./types.js";

export type LockOperationalEnvelope = { code: string; message: string };

export type BatchLockTerminal =
  | { tag: "workflow_terminal"; exitCode: 0 | 1 | 2; result: WorkflowResult }
  | { tag: "lock_mismatch"; result: WorkflowResult }
  | { tag: "operational"; exitCode: 3; envelope: LockOperationalEnvelope; verifiedResult?: WorkflowResult };

export type QuickLockOutcome = {
  report: QuickVerifyReport;
  registryUtf8: string;
  contractExports: QuickContractExport[];
  pq: ParsedQuickCli;
};

export type QuickLockTerminal =
  | ({ tag: "workflow_terminal"; exitCode: 0 | 1 | 2 } & QuickLockOutcome)
  | ({ tag: "lock_mismatch" } & QuickLockOutcome)
  | {
      tag: "operational";
      exitCode: 3;
      envelope: LockOperationalEnvelope;
      verifiedOutcome?: QuickLockOutcome;
    };

export function stripLockFlagsFromArgs(args: string[]): string[] {
  return removeArgPair(removeArgPair(args, "--expect-lock"), "--output-lock");
}

export type ParsedBatchLockRoute = {
  parsed: ParsedBatchVerifyCli;
  lockKind: "output" | "expect";
  lockPath: string;
};

/**
 * XOR lock flags + batch parse. @throws TruthLayerError for usage/CLI errors.
 */
export function parseBatchLockXorAndParsed(restArgs: string[]): ParsedBatchLockRoute {
  const expectLock = argValue(restArgs, "--expect-lock");
  const outputLock = argValue(restArgs, "--output-lock");
  const hasExpect = expectLock !== undefined;
  const hasOutput = outputLock !== undefined;
  if (hasExpect === hasOutput) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
      "batch verify requires exactly one of --expect-lock <path> or --output-lock <path> when using CI lock flags.",
    );
  }
  const parsed = parseBatchVerifyCliArgs(stripLockFlagsFromArgs(restArgs));
  if (parsed.shareReportOrigin !== undefined) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
      "--share-report-origin is not supported with enforce batch.",
    );
  }
  if (hasOutput) {
    return { parsed, lockKind: "output", lockPath: outputLock! };
  }
  return { parsed, lockKind: "expect", lockPath: expectLock! };
}

export type ParsedQuickLockRoute = {
  pq: ParsedQuickCli;
  lockKind: "output" | "expect";
  lockPath: string;
};

/** @throws TruthLayerError */
export function parseQuickLockXorAndParsed(restArgs: string[]): ParsedQuickLockRoute {
  const expectLock = argValue(restArgs, "--expect-lock");
  const outputLock = argValue(restArgs, "--output-lock");
  const hasExpect = expectLock !== undefined;
  const hasOutput = outputLock !== undefined;
  if (hasExpect === hasOutput) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
      "quick verify requires exactly one of --expect-lock <path> or --output-lock <path> when using CI lock flags.",
    );
  }
  const pq = parseQuickCliArgs(stripLockFlagsFromArgs(restArgs));
  if (pq.shareReportOrigin !== undefined) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
      "--share-report-origin is not supported with enforce quick.",
    );
  }
  if (hasOutput) {
    return { pq, lockKind: "output", lockPath: outputLock! };
  }
  return { pq, lockKind: "expect", lockPath: expectLock! };
}

export type ExecuteBatchLockParams = {
  parsed: ParsedBatchVerifyCli;
  lockKind: "output" | "expect";
  lockAbsolutePath: string;
  truthReport: (report: string) => void;
};

function opEnv(code: string, message: string): LockOperationalEnvelope {
  return { code, message };
}

export async function executeBatchLockFromParsed(params: ExecuteBatchLockParams): Promise<BatchLockTerminal> {
  const { parsed, lockKind, lockAbsolutePath, truthReport } = params;
  const truthCb = parsed.noTruthReport ? () => {} : truthReport;

  const runVerify = () =>
    verifyWorkflow({
      workflowId: parsed.workflowId,
      eventsPath: parsed.eventsPath,
      registryPath: parsed.registryPath,
      database: parsed.database,
      verificationPolicy: parsed.verificationPolicy,
      truthReport: truthCb,
    });

  let result: WorkflowResult;
  try {
    result = await runBatchVerifyToValidatedResult(runVerify);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      return { tag: "operational", exitCode: 3, envelope: opEnv(e.code, e.message) };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return {
      tag: "operational",
      exitCode: 3,
      envelope: opEnv(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg)),
    };
  }

  const actualLock = workflowResultToCiLockV1(result);
  assertCiLockSchemaValid(actualLock);

  if (lockKind === "output") {
    try {
      atomicWriteUtf8File(lockAbsolutePath, stableStringify(actualLock) + "\n");
      parseCiLockFromUtf8File(lockAbsolutePath);
    } catch (e) {
      if (e instanceof TruthLayerError) {
        return {
          tag: "operational",
          exitCode: 3,
          envelope: opEnv(e.code, e.message),
          verifiedResult: result,
        };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return {
        tag: "operational",
        exitCode: 3,
        envelope: opEnv(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg)),
        verifiedResult: result,
      };
    }
  } else {
    let expected;
    try {
      expected = parseCiLockFromUtf8File(lockAbsolutePath);
    } catch (e) {
      if (e instanceof TruthLayerError) {
        return {
          tag: "operational",
          exitCode: 3,
          envelope: opEnv(e.code, e.message),
          verifiedResult: result,
        };
      }
      throw e;
    }
    if (expected.kind !== "batch") {
      return {
        tag: "operational",
        exitCode: 3,
        envelope: opEnv(
          CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
          "--expect-lock file must be a batch ci-lock (kind=batch).",
        ),
        verifiedResult: result,
      };
    }
    if (!ciLocksEqualStable(actualLock, expected)) {
      return { tag: "lock_mismatch", result };
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
        return {
          tag: "operational",
          exitCode: 3,
          envelope: opEnv(e.code, e.message),
          verifiedResult: result,
        };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return {
        tag: "operational",
        exitCode: 3,
        envelope: opEnv(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg)),
        verifiedResult: result,
      };
    }
  }

  const exitCode: 0 | 1 | 2 =
    result.status === "complete" ? 0 : result.status === "inconsistent" ? 1 : 2;
  return { tag: "workflow_terminal", exitCode, result };
}

export type ExecuteQuickLockParams = {
  pq: ParsedQuickCli;
  lockKind: "output" | "expect";
  lockAbsolutePath: string;
};

export async function executeQuickLockFromParsed(params: ExecuteQuickLockParams): Promise<QuickLockTerminal> {
  const { pq, lockKind, lockAbsolutePath } = params;

  let inputUtf8: string;
  try {
    inputUtf8 = pq.inputPath === "-" ? readFileSync(0, "utf8") : readFileSync(path.resolve(pq.inputPath), "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      tag: "operational",
      exitCode: 3,
      envelope: opEnv(CLI_OPERATIONAL_CODES.CLI_USAGE, `Cannot read --input: ${msg}`),
    };
  }

  let report: QuickVerifyReport;
  let registryUtf8: string;
  let contractExports: QuickContractExport[];
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
      return { tag: "operational", exitCode: 3, envelope: opEnv(e.code, e.message) };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return {
      tag: "operational",
      exitCode: 3,
      envelope: opEnv(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg)),
    };
  }

  const outcome: QuickLockOutcome = { report, registryUtf8, contractExports, pq };

  const actualLock = quickReportToCiLockV1(report);
  assertCiLockSchemaValid(actualLock);

  if (lockKind === "output") {
    try {
      atomicWriteUtf8File(lockAbsolutePath, stableStringify(actualLock) + "\n");
      parseCiLockFromUtf8File(lockAbsolutePath);
    } catch (e) {
      if (e instanceof TruthLayerError) {
        return {
          tag: "operational",
          exitCode: 3,
          envelope: opEnv(e.code, e.message),
          verifiedOutcome: outcome,
        };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return {
        tag: "operational",
        exitCode: 3,
        envelope: opEnv(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg)),
        verifiedOutcome: outcome,
      };
    }
  } else {
    let expected;
    try {
      expected = parseCiLockFromUtf8File(lockAbsolutePath);
    } catch (e) {
      if (e instanceof TruthLayerError) {
        return {
          tag: "operational",
          exitCode: 3,
          envelope: opEnv(e.code, e.message),
          verifiedOutcome: outcome,
        };
      }
      throw e;
    }
    if (expected.kind !== "quick") {
      return {
        tag: "operational",
        exitCode: 3,
        envelope: opEnv(
          CLI_OPERATIONAL_CODES.ENFORCE_USAGE,
          "--expect-lock file must be a quick ci-lock (kind=quick).",
        ),
        verifiedOutcome: outcome,
      };
    }
    if (!ciLocksEqualStable(actualLock, expected)) {
      return { tag: "lock_mismatch", ...outcome };
    }
  }

  try {
    atomicWriteUtf8File(path.resolve(pq.exportPath), registryUtf8);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      tag: "operational",
      exitCode: 3,
      envelope: opEnv(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(`export-registry: ${msg}`)),
      verifiedOutcome: outcome,
    };
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
      return {
        tag: "operational",
        exitCode: 3,
        envelope: opEnv(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(`emit-events: ${msg}`)),
        verifiedOutcome: outcome,
      };
    }
  }

  const exitCode: 0 | 1 | 2 =
    report.verdict === "pass" ? 0 : report.verdict === "fail" ? 1 : 2;
  return { tag: "workflow_terminal", exitCode, ...outcome };
}

