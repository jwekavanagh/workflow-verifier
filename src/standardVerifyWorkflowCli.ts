import { loadSchemaValidator } from "./schemaLoad.js";
import {
  CLI_OPERATIONAL_CODES,
  cliErrorEnvelope,
  formatOperationalMessage,
} from "./failureCatalog.js";
import { TruthLayerError } from "./truthLayerError.js";
import type { WorkflowResult } from "./types.js";

export type StandardVerifyWorkflowCliIo = {
  consoleLog: (line: string) => void;
  stderrLine: (line: string) => void;
  exit: (code: number) => void;
};

const defaultIo: StandardVerifyWorkflowCliIo = {
  consoleLog: (line) => {
    console.log(line);
  },
  stderrLine: (line) => {
    console.error(line);
  },
  exit: (code) => {
    process.exit(code);
  },
};

/**
 * Shared verify-workflow stdout path: run verification, validate emitted result, optional bundle write, print JSON, exit by verdict.
 * CLI delegates here so tests can inject `runVerify` (e.g. mock `verifyWorkflow`) and I/O without executing `cli.ts` top-level `main()`.
 */
export async function runStandardVerifyWorkflowCliFlow(options: {
  runVerify: () => Promise<WorkflowResult>;
  maybeWriteBundle?: (result: WorkflowResult) => void;
  io?: Partial<StandardVerifyWorkflowCliIo>;
}): Promise<void> {
  const io = { ...defaultIo, ...options.io };
  const writeCliError = (code: string, message: string): void => {
    io.stderrLine(cliErrorEnvelope(code, message));
  };

  let result: WorkflowResult;
  try {
    result = await options.runVerify();
  } catch (e) {
    if (e instanceof TruthLayerError) {
      writeCliError(e.code, e.message);
      io.exit(3);
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
    io.exit(3);
    return;
  }

  const validateResult = loadSchemaValidator("workflow-result");
  if (!validateResult(result)) {
    writeCliError(
      CLI_OPERATIONAL_CODES.WORKFLOW_RESULT_SCHEMA_INVALID,
      JSON.stringify(validateResult.errors ?? []),
    );
    io.exit(3);
    return;
  }

  if (options.maybeWriteBundle !== undefined) {
    try {
      options.maybeWriteBundle(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeCliError(CLI_OPERATIONAL_CODES.INTERNAL_ERROR, formatOperationalMessage(msg));
      io.exit(3);
      return;
    }
  }

  io.consoleLog(JSON.stringify(result));
  if (result.status === "complete") io.exit(0);
  else if (result.status === "inconsistent") io.exit(1);
  else io.exit(2);
}
