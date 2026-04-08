/**
 * Isolated file: vi.mock("node:fs") must not run with other Vitest modules in the same file graph.
 */
import path, { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { writeAgentRunBundle } from "./agentRunBundle.js";
import {
  AGENT_RUN_FILENAME,
  EVENTS_FILENAME,
  WORKFLOW_RESULT_FILENAME,
  WORKFLOW_RESULT_SIG_FILENAME,
} from "./debugCorpus.js";
import type { WorkflowResult } from "./types.js";

const fsHoist = vi.hoisted(() => ({
  actualRenameSync: null as null | typeof import("node:fs").renameSync,
}));

vi.mock("node:fs", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:fs")>();
  fsHoist.actualRenameSync = mod.renameSync;
  return {
    ...mod,
    renameSync: vi.fn((...args: Parameters<typeof mod.renameSync>) => fsHoist.actualRenameSync!(...args)),
  };
});

import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
  renameSync,
} from "node:fs";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const runOk = join(root, "examples", "debug-corpus", "run_ok");

describe("writeAgentRunBundle signed rollback", () => {
  beforeEach(() => {
    vi.mocked(renameSync).mockImplementation((o, n) => fsHoist.actualRenameSync!(o, n));
  });

  it("manifest rename failure removes events, workflow-result, and sidecar", () => {
    const wf = JSON.parse(readFileSync(join(runOk, "workflow-result.json"), "utf8")) as WorkflowResult;
    const evBytes = readFileSync(join(runOk, "events.ndjson"));
    const parent = mkdtempSync(join(tmpdir(), "etl-bundle-rollback-"));
    const runId = "rollback_sig";
    const outDir = join(parent, runId);
    const resolved = path.resolve(outDir);
    const { privateKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const keyPath = join(parent, "key.pem");
    writeFileSync(keyPath, privatePem, "utf8");

    vi.mocked(renameSync).mockImplementation((oldPath, newPath) => {
      if (path.normalize(String(newPath)) === path.normalize(join(resolved, AGENT_RUN_FILENAME))) {
        throw new Error("SIMULATE_MANIFEST_RENAME_FAILURE");
      }
      return fsHoist.actualRenameSync!(oldPath, newPath);
    });
    try {
      expect(() =>
        writeAgentRunBundle({
          outDir,
          eventsNdjson: evBytes,
          workflowResult: wf,
          producer: { name: "workflow-verifier", version: "test" },
          verifiedAt: "2026-04-04T12:00:00.000Z",
          ed25519PrivateKeyPemPath: keyPath,
        }),
      ).toThrow("SIMULATE_MANIFEST_RENAME_FAILURE");
      expect(existsSync(join(resolved, EVENTS_FILENAME))).toBe(false);
      expect(existsSync(join(resolved, WORKFLOW_RESULT_FILENAME))).toBe(false);
      expect(existsSync(join(resolved, WORKFLOW_RESULT_SIG_FILENAME))).toBe(false);
      expect(existsSync(join(resolved, AGENT_RUN_FILENAME))).toBe(false);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
