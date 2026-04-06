import { readFileSync, mkdirSync, writeFileSync, rmSync, mkdtempSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { startDebugServerOnPort, loadCorpusBundle } from "./debugServer.js";
import { buildAgentRunRecordForBundle } from "./agentRunRecord.js";
import { buildWorkflowVerdictSurface } from "./workflowTruthReport.js";
import type { WorkflowResult } from "./types.js";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const exampleCorpus = join(root, "examples", "debug-corpus");
const negativeCorpus = join(root, "test", "fixtures", "corpus-negative");
const slice6Corpus = join(root, "test", "fixtures", "debug-ui-slice6");

function sortedKeys(obj: object): string[] {
  return Object.keys(obj).sort((a, b) => a.localeCompare(b));
}

const DEBUG_API_COMPARE_200_KEYS = ["comparePanelHtml", "humanSummary", "report"];
const DEBUG_API_RUN_DETAIL_OK_KEYS = [
  "agentRunRecord",
  "capturedAtEffectiveMs",
  "executionTrace",
  "loadStatus",
  "malformedEventLineCount",
  "meta",
  "paths",
  "runId",
  "runTrustPanelHtml",
  "workflowResult",
  "workflowVerdictSurface",
];

describe("debugServer HTTP", () => {
  it("GET /api/runs returns one item for examples corpus", async () => {
    const srv = await startDebugServerOnPort(exampleCorpus, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${srv.port}/api/runs?limit=500`);
      expect(res.ok).toBe(true);
      const data = (await res.json()) as { items: unknown[]; totalMatched: number };
      expect(data.items).toHaveLength(1);
      expect(data.totalMatched).toBe(1);
    } finally {
      await srv.close();
    }
  });

  it("GET error run returns 200 with loadStatus error and rawPreview optional", async () => {
    const srv = await startDebugServerOnPort(negativeCorpus, 0);
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
    const srv = await startDebugServerOnPort(negativeCorpus, 0);
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
        workflowResult: { workflowId: string; status: string; steps: unknown[] };
        workflowVerdictSurface: {
          status: string;
          trustSummary: string;
          stepStatusCounts: Record<string, number>;
        };
        agentRunRecord: { workflowId: string };
        runTrustPanelHtml: string;
      };
      expect(sortedKeys(data)).toEqual(DEBUG_API_RUN_DETAIL_OK_KEYS);
      expect(data.runTrustPanelHtml.length).toBeGreaterThan(0);
      expect(data.loadStatus).toBe("ok");
      expect(data.workflowResult.workflowId).toBe("wf_complete");
      expect(data.agentRunRecord.workflowId).toBe("wf_complete");
      expect(Array.isArray(data.executionTrace.nodes)).toBe(true);
      expect(data.workflowVerdictSurface.status).toBe(data.workflowResult.status);
      const expectedSurface = buildWorkflowVerdictSurface(data.workflowResult as WorkflowResult);
      expect(data.workflowVerdictSurface.trustSummary).toBe(expectedSurface.trustSummary);
      expect(data.workflowVerdictSurface.stepStatusCounts).toEqual(expectedSurface.stepStatusCounts);
      const sum = Object.values(data.workflowVerdictSurface.stepStatusCounts).reduce((a, b) => a + b, 0);
      expect(sum).toBe(data.workflowResult.steps.length);
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
      copyFileSync(join(exampleCorpus, "run_ok", "agent-run.json"), join(dir, "r1", "agent-run.json"));
      const wr2 = readFileSync(join(dir, "r2", "workflow-result.json"));
      const ev2 = readFileSync(join(dir, "r2", "events.ndjson"));
      const rec2 = buildAgentRunRecordForBundle({
        runId: "r2",
        workflowId: "wf_inconsistent",
        producer: { name: "execution-truth-layer", version: "0.1.0" },
        verifiedAt: new Date().toISOString(),
        workflowResultBytes: wr2,
        eventsBytes: ev2,
      });
      writeFileSync(join(dir, "r2", "agent-run.json"), JSON.stringify(rec2));
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
        const wrBuf = readFileSync(join(dir, id, "workflow-result.json"));
        const evBuf = readFileSync(join(dir, id, "events.ndjson"));
        const rec = buildAgentRunRecordForBundle({
          runId: id,
          workflowId: "wf_inconsistent",
          producer: { name: "execution-truth-layer", version: "0.1.0" },
          verifiedAt: new Date().toISOString(),
          workflowResultBytes: wrBuf,
          eventsBytes: evBuf,
        });
        writeFileSync(join(dir, id, "agent-run.json"), JSON.stringify(rec));
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

  it("debug_api_POST_compare_200_json_has_exact_keys", async () => {
    const srv = await startDebugServerOnPort(slice6Corpus, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${srv.port}/api/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runIds: ["run_a", "run_b"] }),
      });
      expect(res.ok).toBe(true);
      const data = (await res.json()) as {
        comparePanelHtml: string;
        humanSummary: string;
        report: { schemaVersion: number };
      };
      expect(sortedKeys(data)).toEqual(DEBUG_API_COMPARE_200_KEYS);
      expect(data.comparePanelHtml.length).toBeGreaterThan(0);
      expect(data.report.schemaVersion).toBe(3);
    } finally {
      await srv.close();
    }
  });

  it("debug_api_GET_run_detail_ok_json_has_exact_keys", async () => {
    const srv = await startDebugServerOnPort(slice6Corpus, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${srv.port}/api/runs/run_a`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(sortedKeys(data)).toEqual(DEBUG_API_RUN_DETAIL_OK_KEYS);
    } finally {
      await srv.close();
    }
  });
});

describe("loadCorpusBundle", () => {
  it("aligns outcomes and rows length", () => {
    const b = loadCorpusBundle(exampleCorpus);
    expect(b.outcomes.length).toBe(b.rows.length);
  });
});
