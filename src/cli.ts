#!/usr/bin/env node
import { loadSchemaValidator } from "./schemaLoad.js";
import { verifyWorkflow } from "./pipeline.js";

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}

function usage(): string {
  return `Usage: verify-workflow --workflow-id <id> --events <path> --registry <path> --db <path>

Exit codes:
  0  workflow status complete
  1  workflow status inconsistent
  2  workflow status incomplete`;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    process.exit(2);
  }

  const workflowId = argValue(args, "--workflow-id");
  const eventsPath = argValue(args, "--events");
  const registryPath = argValue(args, "--registry");
  const dbPath = argValue(args, "--db");

  if (!workflowId || !eventsPath || !registryPath || !dbPath) {
    console.error(usage());
    process.exit(2);
  }

  const result = verifyWorkflow({
    workflowId,
    eventsPath,
    registryPath,
    dbPath,
  });

  const validateResult = loadSchemaValidator("workflow-result");
  if (!validateResult(result)) {
    console.error("Internal error: result failed schema validation");
    process.exit(2);
  }

  console.log(JSON.stringify(result));

  if (result.status === "complete") process.exit(0);
  if (result.status === "inconsistent") process.exit(1);
  process.exit(2);
}

main();
