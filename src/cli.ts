#!/usr/bin/env node
import { loadSchemaValidator } from "./schemaLoad.js";
import { verifyWorkflow } from "./pipeline.js";

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}

function usage(): string {
  return `Usage:
  verify-workflow --workflow-id <id> --events <path> --registry <path> --db <sqlitePath>
  verify-workflow --workflow-id <id> --events <path> --registry <path> --postgres-url <url>

Provide exactly one of --db or --postgres-url.

Exit codes:
  0  workflow status complete
  1  workflow status inconsistent
  2  workflow status incomplete`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    process.exit(2);
  }

  const workflowId = argValue(args, "--workflow-id");
  const eventsPath = argValue(args, "--events");
  const registryPath = argValue(args, "--registry");
  const dbPath = argValue(args, "--db");
  const postgresUrl = argValue(args, "--postgres-url");

  if (!workflowId || !eventsPath || !registryPath) {
    console.error(usage());
    process.exit(2);
  }

  const dbCount = (dbPath ? 1 : 0) + (postgresUrl ? 1 : 0);
  if (dbCount !== 1) {
    console.error(usage());
    process.exit(2);
  }

  let result;
  try {
    result = await verifyWorkflow({
      workflowId,
      eventsPath,
      registryPath,
      database: postgresUrl
        ? { kind: "postgres", connectionString: postgresUrl }
        : { kind: "sqlite", path: dbPath! },
    });
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }

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

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(2);
});
