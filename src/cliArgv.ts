import { CLI_OPERATIONAL_CODES } from "./cliOperationalCodes.js";
import { TruthLayerError } from "./truthLayerError.js";
import type { VerificationDatabase, VerificationPolicy } from "./types.js";
import { resolveVerificationPolicyInput } from "./verificationPolicy.js";

export function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}

export function argValues(args: string[], name: string): string[] {
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

export function removeArgPair(args: string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) {
      i += 1;
      continue;
    }
    out.push(args[i]!);
  }
  return out;
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

export type ParsedBatchVerifyCli = {
  workflowId: string;
  eventsPath: string;
  registryPath: string;
  database: VerificationDatabase;
  verificationPolicy: VerificationPolicy;
  noTruthReport: boolean;
  writeRunBundleDir: string | undefined;
  signPrivateKeyPath: string | undefined;
};

/**
 * Parse argv for bare `workflow-verifier` batch mode (no subcommand).
 * @throws TruthLayerError CLI_USAGE
 */
export function parseBatchVerifyCliArgs(args: string[]): ParsedBatchVerifyCli {
  const workflowId = argValue(args, "--workflow-id");
  const eventsPath = argValue(args, "--events");
  const registryPath = argValue(args, "--registry");
  const dbPath = argValue(args, "--db");
  const postgresUrl = argValue(args, "--postgres-url");

  if (!workflowId || !eventsPath || !registryPath) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.CLI_USAGE,
      "Missing --workflow-id, --events, or --registry.",
    );
  }

  const dbCount = (dbPath ? 1 : 0) + (postgresUrl ? 1 : 0);
  if (dbCount !== 1) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.CLI_USAGE,
      "Provide exactly one of --db or --postgres-url.",
    );
  }

  const verificationPolicy = verificationPolicyFromCliArgs(args);
  const noTruthReport = args.includes("--no-truth-report");
  const writeRunBundleDir = argValue(args, "--write-run-bundle");
  const signPrivateKeyPath = argValue(args, "--sign-ed25519-private-key");
  if (signPrivateKeyPath !== undefined && writeRunBundleDir === undefined) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.CLI_USAGE,
      "--sign-ed25519-private-key requires --write-run-bundle.",
    );
  }

  return {
    workflowId,
    eventsPath,
    registryPath,
    database: postgresUrl
      ? { kind: "postgres", connectionString: postgresUrl }
      : { kind: "sqlite", path: dbPath! },
    verificationPolicy,
    noTruthReport,
    writeRunBundleDir,
    signPrivateKeyPath,
  };
}

export type ParsedQuickCli = {
  inputPath: string;
  exportPath: string;
  emitEventsPath: string | undefined;
  workflowIdQuick: string;
  dbPath: string | undefined;
  postgresUrl: string | undefined;
};

/**
 * Parse argv for `workflow-verifier quick` (after `quick` token).
 * @throws TruthLayerError CLI_USAGE
 */
export function parseQuickCliArgs(args: string[]): ParsedQuickCli {
  const inputPath = argValue(args, "--input");
  const exportPath = argValue(args, "--export-registry");
  const emitEventsPath = argValue(args, "--emit-events");
  const workflowIdQuick = argValue(args, "--workflow-id") ?? "quick-verify";
  const dbPath = argValue(args, "--db");
  const postgresUrl = argValue(args, "--postgres-url");
  if (!inputPath || !exportPath) {
    throw new TruthLayerError(CLI_OPERATIONAL_CODES.CLI_USAGE, "Missing --input or --export-registry.");
  }
  const dbCount = (dbPath ? 1 : 0) + (postgresUrl ? 1 : 0);
  if (dbCount !== 1) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.CLI_USAGE,
      "Provide exactly one of --db or --postgres-url.",
    );
  }
  return {
    inputPath,
    exportPath,
    emitEventsPath,
    workflowIdQuick,
    dbPath,
    postgresUrl,
  };
}
