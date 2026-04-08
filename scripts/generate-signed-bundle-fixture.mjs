/**
 * Regenerates test/fixtures/signed-bundle-v2 (committed golden signed bundle).
 * Run from repo root after build: node scripts/generate-signed-bundle-fixture.mjs
 *
 * Uses Node crypto.generateKeyPairSync("ed25519"); PKCS#8 private is ephemeral (not written).
 * Only ed25519-public.pem + four bundle files are written to the fixture directory.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(root, "test", "fixtures", "signed-bundle-v2");
const runOk = join(root, "examples", "debug-corpus", "run_ok");

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
if (typeof privatePem !== "string") throw new Error("expected PKCS8 PEM string");

const publicPem = publicKey.export({ type: "spki", format: "pem" });
if (typeof publicPem !== "string") throw new Error("expected SPKI PEM string");

const { buildWorkflowResultSigSidecarBytes } = await import("../dist/workflowResultSignature.js");
const { buildAgentRunRecordForBundle } = await import("../dist/agentRunRecord.js");

const eventsBytes = readFileSync(join(runOk, "events.ndjson"));
const workflowResultBytes = readFileSync(join(runOk, "workflow-result.json"));
const wf = JSON.parse(workflowResultBytes.toString("utf8"));

const sidecarBytes = buildWorkflowResultSigSidecarBytes(workflowResultBytes, privatePem);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const producer = {
  name: typeof pkg.name === "string" ? pkg.name : "workflow-verifier",
  version: typeof pkg.version === "string" ? pkg.version : "0.0.0",
};

const record = buildAgentRunRecordForBundle({
  runId: "signed-bundle-v2",
  workflowId: wf.workflowId,
  producer,
  verifiedAt: "2026-04-07T12:00:00.000Z",
  workflowResultBytes,
  eventsBytes,
  workflowResultSignatureBytes: sidecarBytes,
});

mkdirSync(fixtureDir, { recursive: true });
writeFileSync(join(fixtureDir, "events.ndjson"), eventsBytes);
writeFileSync(join(fixtureDir, "workflow-result.json"), workflowResultBytes);
writeFileSync(join(fixtureDir, "workflow-result.sig.json"), sidecarBytes);
writeFileSync(join(fixtureDir, "agent-run.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
writeFileSync(join(fixtureDir, "ed25519-public.pem"), publicPem.replace(/\r\n/g, "\n").endsWith("\n") ? publicPem.replace(/\r\n/g, "\n") : `${publicPem.replace(/\r\n/g, "\n").trim()}\n`, "utf8");

console.log("Wrote", fixtureDir);
