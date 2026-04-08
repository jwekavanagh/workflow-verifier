import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { writeAgentRunBundle } from "./agentRunBundle.js";
import { BUNDLE_SIGNATURE_PRIVATE_KEY_INVALID } from "./bundleSignatureCodes.js";
import { TruthLayerError } from "./truthLayerError.js";
import type { WorkflowResult } from "./types.js";

export function readPackageIdentity(): { name: string; version: string } {
  const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const raw = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { name?: string; version?: string };
  const name = typeof pkg.name === "string" && pkg.name.length > 0 ? pkg.name : "workflow-verifier";
  const version = typeof pkg.version === "string" && pkg.version.length > 0 ? pkg.version : "0.0.0";
  return { name, version };
}

export function writeRunBundleCli(
  outDir: string,
  eventsNdjson: Buffer,
  workflowResult: WorkflowResult,
  signPrivateKeyPath: string | undefined,
): void {
  writeAgentRunBundle({
    outDir,
    eventsNdjson,
    workflowResult,
    producer: readPackageIdentity(),
    verifiedAt: new Date().toISOString(),
    ...(signPrivateKeyPath !== undefined ? { ed25519PrivateKeyPemPath: signPrivateKeyPath } : {}),
  });
}

export function isBundlePrivateKeyTruthError(e: unknown): e is TruthLayerError {
  return e instanceof TruthLayerError && e.code === BUNDLE_SIGNATURE_PRIVATE_KEY_INVALID;
}
