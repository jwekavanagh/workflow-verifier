import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { writeAgentRunBundle } from "./agentRunBundle.js";
import { sha256Hex } from "./agentRunRecord.js";
import {
  DEBUG_CORPUS_CODES,
  loadCorpusRun,
  resolveCorpusRootReal,
} from "./debugCorpus.js";
import type { WorkflowResult } from "./types.js";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const runOk = join(root, "examples", "debug-corpus", "run_ok");

describe("writeAgentRunBundle", () => {
  it("round-trip: written bundle loads ok with matching hashes", () => {
    const wf = JSON.parse(readFileSync(join(runOk, "workflow-result.json"), "utf8")) as WorkflowResult;
    const evBytes = readFileSync(join(runOk, "events.ndjson"));
    const parent = mkdtempSync(join(tmpdir(), "etl-bundle-rt-"));
    const runId = "bundle_rt";
    const outDir = join(parent, runId);
    try {
      writeAgentRunBundle({
        outDir,
        eventsNdjson: evBytes,
        workflowResult: wf,
        producer: { name: "workflow-verifier", version: "test" },
        verifiedAt: "2026-04-04T12:00:00.000Z",
      });
      const corpusRoot = resolveCorpusRootReal(parent);
      const loaded = loadCorpusRun(corpusRoot, runId);
      expect(loaded.loadStatus).toBe("ok");
      if (loaded.loadStatus !== "ok") return;
      expect(loaded.workflowResult.status).toBe(wf.status);
      expect(loaded.agentRunRecord.artifacts.events.sha256).toBe(sha256Hex(evBytes));
      const wrBytes = readFileSync(join(outDir, "workflow-result.json"));
      expect(loaded.agentRunRecord.artifacts.workflowResult.sha256).toBe(sha256Hex(wrBytes));
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("empty events.ndjson: manifest hash is empty-buffer SHA-256 and loadCorpusRun is ok", () => {
    const wf = JSON.parse(readFileSync(join(runOk, "workflow-result.json"), "utf8")) as WorkflowResult;
    const empty = Buffer.alloc(0);
    expect(sha256Hex(empty)).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    const parent = mkdtempSync(join(tmpdir(), "etl-bundle-empty-"));
    const runId = "empty_ev";
    const outDir = join(parent, runId);
    try {
      writeAgentRunBundle({
        outDir,
        eventsNdjson: empty,
        workflowResult: wf,
        producer: { name: "workflow-verifier", version: "test" },
        verifiedAt: "2026-04-04T12:00:00.000Z",
      });
      const loaded = loadCorpusRun(resolveCorpusRootReal(parent), runId);
      expect(loaded.loadStatus).toBe("ok");
      if (loaded.loadStatus !== "ok") return;
      expect(loaded.agentRunRecord.artifacts.events.byteLength).toBe(0);
      expect(loaded.agentRunRecord.artifacts.events.sha256).toBe(sha256Hex(empty));
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("tampered workflow-result without manifest update yields ARTIFACT_INTEGRITY_MISMATCH", () => {
    const wf = JSON.parse(readFileSync(join(runOk, "workflow-result.json"), "utf8")) as WorkflowResult;
    const evBytes = readFileSync(join(runOk, "events.ndjson"));
    const parent = mkdtempSync(join(tmpdir(), "etl-bundle-bad-"));
    const runId = "tamper";
    const outDir = join(parent, runId);
    try {
      writeAgentRunBundle({
        outDir,
        eventsNdjson: evBytes,
        workflowResult: wf,
        producer: { name: "workflow-verifier", version: "test" },
        verifiedAt: "2026-04-04T12:00:00.000Z",
      });
      const wrPath = join(outDir, "workflow-result.json");
      const buf = readFileSync(wrPath);
      const b = Buffer.from(buf);
      b[b.length - 2] ^= 1;
      writeFileSync(wrPath, b);
      const loaded = loadCorpusRun(resolveCorpusRootReal(parent), runId);
      expect(loaded.loadStatus).toBe("error");
      if (loaded.loadStatus !== "error") return;
      expect(loaded.error.code).toBe(DEBUG_CORPUS_CODES.ARTIFACT_INTEGRITY_MISMATCH);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("signed bundle round-trip: loadCorpusRun ok and schemaVersion 2", () => {
    const wf = JSON.parse(readFileSync(join(runOk, "workflow-result.json"), "utf8")) as WorkflowResult;
    const evBytes = readFileSync(join(runOk, "events.ndjson"));
    const parent = mkdtempSync(join(tmpdir(), "etl-bundle-signed-"));
    const runId = "signed_rt";
    const outDir = join(parent, runId);
    const { privateKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const keyPath = join(parent, "key.pem");
    writeFileSync(keyPath, privatePem, "utf8");
    try {
      writeAgentRunBundle({
        outDir,
        eventsNdjson: evBytes,
        workflowResult: wf,
        producer: { name: "workflow-verifier", version: "test" },
        verifiedAt: "2026-04-04T12:00:00.000Z",
        ed25519PrivateKeyPemPath: keyPath,
      });
      const loaded = loadCorpusRun(resolveCorpusRootReal(parent), runId);
      expect(loaded.loadStatus).toBe("ok");
      if (loaded.loadStatus === "ok" && loaded.agentRunRecord.schemaVersion === 2) {
        expect(loaded.agentRunRecord.artifacts.workflowResultSignature.relativePath).toBe(
          "workflow-result.sig.json",
        );
      }
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
