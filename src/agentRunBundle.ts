import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgentRunRecordForBundle } from "./agentRunRecord.js";
import {
  AGENT_RUN_FILENAME,
  EVENTS_FILENAME,
  WORKFLOW_RESULT_FILENAME,
  WORKFLOW_RESULT_SIG_FILENAME,
} from "./debugCorpus.js";
import type { WorkflowResult } from "./types.js";
import { buildWorkflowResultSigSidecarBytes } from "./workflowResultSignature.js";

export type WriteAgentRunBundleOptions = {
  outDir: string;
  eventsNdjson: Buffer;
  workflowResult: WorkflowResult;
  /** Defaults to `name` / `version` from package.json next to built `dist`. */
  producer?: { name: string; version: string };
  /** Defaults to `new Date().toISOString()`. */
  verifiedAt?: string;
  /**
   * PKCS#8 PEM Ed25519 private key path. When set, writes `workflow-result.sig.json` and manifest schemaVersion 2.
   */
  ed25519PrivateKeyPemPath?: string;
};

function readPackageIdentity(): { name: string; version: string } {
  const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const raw = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { name?: string; version?: string };
  const name = typeof pkg.name === "string" && pkg.name.length > 0 ? pkg.name : "workflow-verifier";
  const version = typeof pkg.version === "string" && pkg.version.length > 0 ? pkg.version : "0.0.0";
  return { name, version };
}

/**
 * Write `data` to `dir/finalName` by writing a temp file in `dir` then renaming.
 * On Windows, replacing an existing file via rename may fail; then unlink final and rename again.
 */
function atomicWriteFileSync(dir: string, finalName: string, data: Buffer): void {
  const tmpName = `${finalName}.${process.pid}.${Date.now()}.tmp`;
  const tmpPath = path.join(dir, tmpName);
  const finalPath = path.join(dir, finalName);
  writeFileSync(tmpPath, data);
  try {
    try {
      renameSync(tmpPath, finalPath);
    } catch (e) {
      if (existsSync(finalPath)) {
        unlinkSync(finalPath);
        renameSync(tmpPath, finalPath);
      } else {
        throw e;
      }
    }
  } catch (e) {
    if (existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
    throw e;
  }
}

function rollbackSignedFinals(resolved: string, written: string[]): void {
  for (const name of [...written].reverse()) {
    const p = path.join(resolved, name);
    if (existsSync(p)) {
      try {
        unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Writes canonical run bundle: `events.ndjson`, `workflow-result.json`, optional `workflow-result.sig.json`, `agent-run.json`.
 * Rename order: events → workflow-result → [sig] → manifest (last).
 * Signed path: on failure after some renames, best-effort reverse unlink of completed finals.
 */
export function writeAgentRunBundle(options: WriteAgentRunBundleOptions): void {
  const resolved = path.resolve(options.outDir);
  const eventsBytes = options.eventsNdjson;
  const workflowResultBytes = Buffer.from(JSON.stringify(options.workflowResult), "utf8");
  const producer = options.producer ?? readPackageIdentity();
  const verifiedAt = options.verifiedAt ?? new Date().toISOString();

  const signingPath = options.ed25519PrivateKeyPemPath;
  let workflowResultSignatureBytes: Buffer | undefined;
  if (signingPath !== undefined) {
    const privatePem = readFileSync(path.resolve(signingPath), "utf8");
    workflowResultSignatureBytes = buildWorkflowResultSigSidecarBytes(workflowResultBytes, privatePem);
  }

  const record = buildAgentRunRecordForBundle({
    runId: path.basename(resolved),
    workflowId: options.workflowResult.workflowId,
    producer,
    verifiedAt,
    workflowResultBytes,
    eventsBytes,
    ...(workflowResultSignatureBytes !== undefined
      ? { workflowResultSignatureBytes }
      : {}),
  });
  const agentRunBytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");

  mkdirSync(resolved, { recursive: true });

  const signed = workflowResultSignatureBytes !== undefined;
  const written: string[] = [];

  try {
    atomicWriteFileSync(resolved, EVENTS_FILENAME, eventsBytes);
    written.push(EVENTS_FILENAME);
    atomicWriteFileSync(resolved, WORKFLOW_RESULT_FILENAME, workflowResultBytes);
    written.push(WORKFLOW_RESULT_FILENAME);
    if (signed && workflowResultSignatureBytes) {
      atomicWriteFileSync(resolved, WORKFLOW_RESULT_SIG_FILENAME, workflowResultSignatureBytes);
      written.push(WORKFLOW_RESULT_SIG_FILENAME);
    }
    atomicWriteFileSync(resolved, AGENT_RUN_FILENAME, agentRunBytes);
    written.push(AGENT_RUN_FILENAME);
  } catch (e) {
    if (signed) {
      rollbackSignedFinals(resolved, written);
    }
    throw e;
  }
}
