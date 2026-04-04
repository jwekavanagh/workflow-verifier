import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { buildExecutionTraceView } from "./executionTrace.js";
import { loadEventsForWorkflow } from "./loadEvents.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import {
  loadAllCorpusRuns,
  debugUiDir,
  type CorpusRunOutcome,
  type CorpusRunLoadedOk,
} from "./debugCorpus.js";
import { buildFocusTargets } from "./debugFocus.js";
import { buildCorpusPatterns } from "./debugPatterns.js";
import { runListItemFromOutcome } from "./debugRunIndex.js";
import {
  filterAndPaginate,
  parseLimitCursor,
  parseRunListQuery,
} from "./debugRunFilters.js";
import {
  buildRunComparisonReport,
  formatRunComparisonReport,
} from "./runComparison.js";
import type { WorkflowResult } from "./types.js";

const validateTrace = loadSchemaValidator("execution-trace-view");
const validateCompareReport = loadSchemaValidator("run-comparison-report");

function json(res: ServerResponse, status: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(s);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const DEBUG_UI_FILES = new Set(["index.html", "app.js", "app.css"]);

function serveStatic(
  res: ServerResponse,
  urlPath: string,
): void {
  const base = debugUiDir();
  const name = path.basename(urlPath) || "index.html";
  if (!DEBUG_UI_FILES.has(name)) {
    res.writeHead(403).end();
    return;
  }
  const filePath = path.join(base, name);
  if (!existsSync(filePath)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const buf = readFileSync(filePath);
    const ext = path.extname(filePath);
    const ct =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".js"
          ? "text/javascript; charset=utf-8"
          : ext === ".css"
            ? "text/css; charset=utf-8"
            : "application/octet-stream";
    res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-store" });
    res.end(buf);
  } catch {
    res.writeHead(500).end();
  }
}

export function loadCorpusBundle(corpusRoot: string): {
  outcomes: CorpusRunOutcome[];
  rows: ReturnType<typeof runListItemFromOutcome>[];
} {
  const outcomes = loadAllCorpusRuns(corpusRoot);
  const rows = outcomes.map((o, i) => runListItemFromOutcome(o, i));
  return { outcomes, rows };
}

/** Mirrors UI-visible load errors to stderr (call once at startup). */
export function logCorpusLoadErrors(outcomes: CorpusRunOutcome[]): void {
  for (const o of outcomes) {
    if (o.loadStatus === "error") {
      process.stderr.write(
        `[debug] corpus run ${JSON.stringify(o.runId)} load error ${o.error.code}: ${o.error.message}\n`,
      );
    }
  }
}

export function createDebugServer(corpusRoot: string): {
  server: Server;
  listen: (port: number) => Promise<number>;
} {
  const server = createServer((req, res) => {
    void handleRequest(corpusRoot, req, res);
  });
  return {
    server,
    listen(port: number) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          const addr = server.address();
          const p = typeof addr === "object" && addr ? addr.port : port;
          resolve(p);
        });
      });
    },
  };
}

async function handleRequest(
  corpusRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname;

  try {
    if (req.method === "GET" && pathname === "/api/health") {
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/api/runs") {
      const { outcomes, rows } = loadCorpusBundle(corpusRoot);
      const q = parseRunListQuery(url.searchParams);
      const { limit, offset } = parseLimitCursor(url.searchParams);
      const { items, totalMatched, nextCursor } = filterAndPaginate(rows, q, limit, offset);
      json(res, 200, {
        items,
        nextCursor,
        totalMatched,
        filterEcho: q,
      });
      return;
    }

    const runDetailMatch = /^\/api\/runs\/([^/]+)\/?$/.exec(pathname);
    if (req.method === "GET" && runDetailMatch) {
      const runId = decodeURIComponent(runDetailMatch[1]!);
      const { outcomes } = loadCorpusBundle(corpusRoot);
      const outcome = outcomes.find((o) => o.runId === runId);
      if (!outcome) {
        json(res, 404, { code: "RUN_NOT_FOUND", message: `Unknown runId ${runId}` });
        return;
      }
      if (outcome.loadStatus === "error") {
        json(res, 200, {
          loadStatus: "error",
          runId: outcome.runId,
          error: outcome.error,
          pathsTried: outcome.pathsTried,
          rawPreview: outcome.rawPreview,
          capturedAtEffectiveMs: outcome.capturedAtEffectiveMs,
          meta: outcome.meta ?? {},
        });
        return;
      }
      const o = outcome as CorpusRunLoadedOk;
      let load;
      try {
        load = loadEventsForWorkflow(o.paths.events, o.workflowResult.workflowId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { code: "EVENTS_RELOAD_FAILED", message: msg });
        return;
      }
      const trace = buildExecutionTraceView({
        workflowId: o.workflowResult.workflowId,
        runEvents: load.runEvents,
        malformedEventLineCount: load.malformedEventLineCount,
        workflowResult: o.workflowResult,
      });
      if (!validateTrace(trace)) {
        json(res, 500, {
          code: "TRACE_SCHEMA_INVALID",
          details: validateTrace.errors ?? [],
        });
        return;
      }
      json(res, 200, {
        loadStatus: "ok",
        runId: o.runId,
        workflowResult: o.workflowResult,
        executionTrace: trace,
        malformedEventLineCount: load.malformedEventLineCount,
        meta: o.meta,
        capturedAtEffectiveMs: o.capturedAtEffectiveMs,
        paths: o.paths,
      });
      return;
    }

    const focusMatch = /^\/api\/runs\/([^/]+)\/focus\/?$/.exec(pathname);
    if (req.method === "GET" && focusMatch) {
      const runId = decodeURIComponent(focusMatch[1]!);
      const { outcomes } = loadCorpusBundle(corpusRoot);
      const outcome = outcomes.find((o) => o.runId === runId);
      if (!outcome) {
        json(res, 404, { code: "RUN_NOT_FOUND", message: `Unknown runId ${runId}` });
        return;
      }
      if (outcome.loadStatus === "error") {
        json(res, 409, {
          code: "FOCUS_NOT_AVAILABLE",
          message: "Focus targets require a successfully loaded run.",
        });
        return;
      }
      const o = outcome as CorpusRunLoadedOk;
      const load = loadEventsForWorkflow(o.paths.events, o.workflowResult.workflowId);
      const trace = buildExecutionTraceView({
        workflowId: o.workflowResult.workflowId,
        runEvents: load.runEvents,
        malformedEventLineCount: load.malformedEventLineCount,
        workflowResult: o.workflowResult,
      });
      const focus = buildFocusTargets(o.workflowResult, trace);
      json(res, 200, focus);
      return;
    }

    if (req.method === "GET" && pathname === "/api/corpus-patterns") {
      const { outcomes, rows } = loadCorpusBundle(corpusRoot);
      const q = parseRunListQuery(url.searchParams);
      const result = buildCorpusPatterns(outcomes, rows, q);
      if (!result.ok) {
        json(res, result.status, {
          code: result.code,
          message: result.message,
          totalMatched: result.totalMatched,
        });
        return;
      }
      json(res, 200, result.body);
      return;
    }

    if (req.method === "POST" && pathname === "/api/compare") {
      const raw = await readBody(req);
      let body: unknown;
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        json(res, 400, { code: "INVALID_JSON", message: "Request body must be JSON." });
        return;
      }
      if (
        body === null ||
        typeof body !== "object" ||
        !Array.isArray((body as { runIds?: unknown }).runIds)
      ) {
        json(res, 400, { code: "INVALID_BODY", message: "Expected { runIds: string[] }." });
        return;
      }
      const runIds = (body as { runIds: string[] }).runIds;
      if (runIds.length < 2) {
        json(res, 400, { code: "COMPARE_MIN_TWO", message: "At least two runIds required." });
        return;
      }
      const { outcomes } = loadCorpusBundle(corpusRoot);
      const results: WorkflowResult[] = [];
      const labels: string[] = [];
      for (const id of runIds) {
        const o = outcomes.find((x) => x.runId === id);
        if (!o) {
          json(res, 400, { code: "UNKNOWN_RUN", message: `Unknown runId ${id}` });
          return;
        }
        if (o.loadStatus === "error") {
          json(res, 400, {
            code: "RUN_NOT_LOADED",
            message: `Run ${id} did not load successfully.`,
          });
          return;
        }
        results.push(o.workflowResult);
        labels.push(id);
      }
      const wf0 = results[0]!.workflowId;
      for (const r of results) {
        if (r.workflowId !== wf0) {
          json(res, 400, {
            code: "COMPARE_WORKFLOW_ID_MISMATCH",
            message: "All WorkflowResult inputs must share the same workflowId.",
          });
          return;
        }
      }
      const report = buildRunComparisonReport(results, labels);
      if (!validateCompareReport(report)) {
        json(res, 500, {
          code: "COMPARE_REPORT_INVALID",
          details: validateCompareReport.errors ?? [],
        });
        return;
      }
      json(res, 200, {
        report,
        humanSummary: formatRunComparisonReport(report),
      });
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/")) {
      json(res, 404, { code: "NOT_FOUND", message: pathname });
      return;
    }

    if (req.method === "GET") {
      const staticPath = pathname === "/" ? "index.html" : pathname.slice(1);
      serveStatic(res, staticPath);
      return;
    }

    res.writeHead(405).end();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    json(res, 500, { code: "INTERNAL", message: msg });
  }
}

export function debugServerEntryUrl(port: number): string {
  return `http://127.0.0.1:${port}/`;
}

export async function startDebugServerOnPort(
  corpusRoot: string,
  port: number,
): Promise<{ port: number; close: () => Promise<void> }> {
  const { server, listen } = createDebugServer(corpusRoot);
  const p = await listen(port);
  return {
    port: p,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
