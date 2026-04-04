import { readFileSync, mkdirSync, writeFileSync, rmSync, mkdtempSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { startDebugServerOnPort, loadCorpusBundle } from "./debugServer.js";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const exampleCorpus = join(root, "examples", "debug-corpus");

describe("debugServer HTTP", () => {
  it("GET /api/runs returns four items for examples corpus", async () => {
    const srv = await startDebugServerOnPort(exampleCorpus, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${srv.port}/api/runs?limit=500`);
      expect(res.ok).toBe(true);
      const data = (await res.json()) as { items: unknown[]; totalMatched: number };
      expect(data.items).toHaveLength(4);
      expect(data.totalMatched).toBe(4);
    } finally {
      await srv.close();
    }
  });

  it("GET error run returns 200 with loadStatus error and rawPreview optional", async () => {
    const srv = await startDebugServerOnPort(exampleCorpus, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${srv.port}/api/runs/run_bad_json`);
      expect(res.ok).toBe(true);
      const data = (await res.json()) as { loadStatus: string; error: { code: string } };
      expect(data.loadStatus).toBe("error");
      expect(data.error.code).toBe("WORKFLOW_RESULT_JSON");
    } finally {
      await srv.close();
    }
  });

  it("GET /api/runs/:id/focus returns 409 for error row", async () => {
    const srv = await startDebugServerOnPort(exampleCorpus, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${srv.port}/api/runs/run_bad_json/focus`);
      expect(res.status).toBe(409);
    } finally {
      await srv.close();
    }
  });

  it("GET /api/runs/run_ok returns executionTrace and workflowResult", async () => {
    const srv = await startDebugServerOnPort(exampleCorpus, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${srv.port}/api/runs/run_ok`);
      expect(res.ok).toBe(true);
      const data = (await res.json()) as {
        loadStatus: string;
        executionTrace: { nodes: unknown[] };
        workflowResult: { workflowId: string };
      };
      expect(data.loadStatus).toBe("ok");
      expect(data.workflowResult.workflowId).toBe("wf_complete");
      expect(Array.isArray(data.executionTrace.nodes)).toBe(true);
    } finally {
      await srv.close();
    }
  });

  it("POST /api/compare 400 on workflowId mismatch", async () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-dbg-"));
    try {
      mkdirSync(join(dir, "r1"), { recursive: true });
      mkdirSync(join(dir, "r2"), { recursive: true });
      copyFileSync(
        join(exampleCorpus, "run_ok", "workflow-result.json"),
        join(dir, "r1", "workflow-result.json"),
      );
      copyFileSync(
        join(root, "test", "fixtures", "wf_inconsistent_result.json"),
        join(dir, "r2", "workflow-result.json"),
      );
      copyFileSync(join(exampleCorpus, "run_ok", "events.ndjson"), join(dir, "r1", "events.ndjson"));
      copyFileSync(join(root, "examples", "events.ndjson"), join(dir, "r2", "events.ndjson"));
      const srv = await startDebugServerOnPort(dir, 0);
      try {
        const res = await fetch(`http://127.0.0.1:${srv.port}/api/compare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runIds: ["r1", "r2"] }),
        });
        expect(res.status).toBe(400);
        const j = (await res.json()) as { code: string };
        expect(j.code).toBe("COMPARE_WORKFLOW_ID_MISMATCH");
      } finally {
        await srv.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("GET /api/corpus-patterns finds shared signature across two failing runs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-dbg-pat-"));
    try {
      const wrPath = join(root, "test", "fixtures", "wf_inconsistent_result.json");
      const wr = readFileSync(wrPath, "utf8");
      const lines = readFileSync(join(root, "examples", "events.ndjson"), "utf8").split(/\r?\n/).filter((l) => l.trim());
      const evNdjson = `${lines[3]}\n`;
      for (const id of ["p1", "p2"]) {
        mkdirSync(join(dir, id), { recursive: true });
        writeFileSync(join(dir, id, "workflow-result.json"), wr);
        writeFileSync(join(dir, id, "events.ndjson"), evNdjson);
      }
      const srv = await startDebugServerOnPort(dir, 0);
      try {
        const res = await fetch(`http://127.0.0.1:${srv.port}/api/corpus-patterns`);
        expect(res.ok).toBe(true);
        const data = (await res.json()) as {
          recurrenceCandidates: Array<{ signature: string; hitRuns: number }>;
        };
        const top = data.recurrenceCandidates[0];
        expect(top).toBeDefined();
        expect(top!.hitRuns).toBeGreaterThanOrEqual(2);
      } finally {
        await srv.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("loadCorpusBundle", () => {
  it("aligns outcomes and rows length", () => {
    const b = loadCorpusBundle(exampleCorpus);
    expect(b.outcomes.length).toBe(b.rows.length);
  });
});
