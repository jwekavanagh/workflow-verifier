import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  DEBUG_CORPUS_CODES,
  isPathUnderRoot,
  listCorpusRunIds,
  loadAllCorpusRuns,
  loadCorpusRun,
  resolveCorpusRootReal,
} from "./debugCorpus.js";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");

describe("debugCorpus", () => {
  it("examples/debug-corpus has four run folders, one ok and three error", () => {
    const corpus = join(root, "examples", "debug-corpus");
    const outcomes = loadAllCorpusRuns(corpus);
    expect(outcomes).toHaveLength(4);
    const ok = outcomes.filter((o) => o.loadStatus === "ok");
    const err = outcomes.filter((o) => o.loadStatus === "error");
    expect(ok).toHaveLength(1);
    expect(err).toHaveLength(3);
    expect(ok[0]!.runId).toBe("run_ok");
    const codes = new Set(err.map((e) => e.error.code));
    expect(codes.has(DEBUG_CORPUS_CODES.WORKFLOW_RESULT_JSON)).toBe(true);
    expect(codes.has(DEBUG_CORPUS_CODES.MISSING_EVENTS)).toBe(true);
    expect(codes.has(DEBUG_CORPUS_CODES.WORKFLOW_RESULT_INVALID)).toBe(true);
  });

  it("isPathUnderRoot rejects escape", () => {
    const a = join(tmpdir(), `etl-dc-${Date.now()}`);
    mkdirSync(a, { recursive: true });
    const aReal = resolveCorpusRootReal(a);
    try {
      const outside = join(aReal, "..", "..");
      const outsideReal = resolveCorpusRootReal(outside);
      expect(isPathUnderRoot(aReal, outsideReal)).toBe(false);
    } finally {
      rmSync(a, { recursive: true, force: true });
    }
  });

  it("never omits a child directory from enumeration", () => {
    const base = mkdtempSync(join(tmpdir(), "etl-corpus-"));
    try {
      mkdirSync(join(base, "a"), { recursive: true });
      mkdirSync(join(base, "b"), { recursive: true });
      writeFileSync(join(base, "a", "workflow-result.json"), "{}");
      writeFileSync(join(base, "b", "workflow-result.json"), "{}");
      const ids = listCorpusRunIds(base);
      expect(ids.sort()).toEqual(["a", "b"]);
      const out = loadAllCorpusRuns(base);
      expect(out).toHaveLength(2);
      expect(out.every((o) => o.loadStatus === "error")).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("PATH_ESCAPE when resolved path leaves corpus root", () => {
    const base = mkdtempSync(join(tmpdir(), "etl-corpus-"));
    try {
      const rootReal = resolveCorpusRootReal(base);
      const o = loadCorpusRun(rootReal, "..");
      expect(o.loadStatus).toBe("error");
      if (o.loadStatus === "error") {
        expect(o.error.code).toBe(DEBUG_CORPUS_CODES.PATH_ESCAPE);
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
