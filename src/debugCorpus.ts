import { readdirSync, readFileSync, statSync, existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEventsForWorkflow } from "./loadEvents.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import { TruthLayerError } from "./truthLayerError.js";
import type { WorkflowResult } from "./types.js";
import { normalizeToEmittedWorkflowResult } from "./workflowResultNormalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const WORKFLOW_RESULT_FILENAME = "workflow-result.json";
export const EVENTS_FILENAME = "events.ndjson";
export const META_FILENAME = "meta.json";

export const DEBUG_CORPUS_CODES = {
  PATH_ESCAPE: "PATH_ESCAPE",
  MISSING_WORKFLOW_RESULT: "MISSING_WORKFLOW_RESULT",
  MISSING_EVENTS: "MISSING_EVENTS",
  WORKFLOW_RESULT_INVALID: "WORKFLOW_RESULT_INVALID",
  WORKFLOW_RESULT_JSON: "WORKFLOW_RESULT_JSON",
  META_INVALID: "META_INVALID",
  EVENTS_LOAD_FAILED: "EVENTS_LOAD_FAILED",
} as const;

export type CorpusMeta = {
  customerId?: string;
  capturedAt?: string;
};

export type CorpusLoadError = {
  code: string;
  message: string;
  path?: string;
  details?: unknown;
};

export type CorpusRunLoadedOk = {
  loadStatus: "ok";
  runId: string;
  workflowResult: WorkflowResult;
  meta: CorpusMeta;
  capturedAtEffectiveMs: number;
  paths: { workflowResult: string; events: string };
  /** From loadEventsForWorkflow — needed for trace build */
  malformedEventLineCount: number;
};

export type CorpusRunLoadedError = {
  loadStatus: "error";
  runId: string;
  error: CorpusLoadError;
  pathsTried: { workflowResult?: string; events?: string };
  rawPreview?: string;
  capturedAtEffectiveMs: number;
  /** Present when `meta.json` was parsed before the failure. */
  meta?: CorpusMeta;
};

export type CorpusRunOutcome = CorpusRunLoadedOk | CorpusRunLoadedError;

const validateWorkflowResult = loadSchemaValidator("workflow-result");

function isSafeRunId(runId: string): boolean {
  if (runId === "." || runId === "..") return false;
  if (runId.includes("/") || runId.includes("\\")) return false;
  if (runId.includes("\0")) return false;
  return runId.length > 0;
}

/** True iff `targetReal` is `rootReal` or a path under it (after realpath). */
export function isPathUnderRoot(rootReal: string, targetReal: string): boolean {
  const rel = path.relative(rootReal, targetReal);
  if (rel === "") return true;
  return !rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel);
}

export function listCorpusRunIds(corpusRoot: string): string[] {
  const entries = readdirSync(corpusRoot, { withFileTypes: true });
  const ids = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  return ids.filter(isSafeRunId).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function mtimeMs(filePath: string): number {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function readUtf8Preview(filePath: string, maxBytes: number): string | undefined {
  try {
    const buf = readFileSync(filePath);
    const slice = buf.subarray(0, Math.min(buf.length, maxBytes));
    return slice.toString("utf8");
  } catch {
    return undefined;
  }
}

function parseMetaFile(metaPath: string): { ok: true; meta: CorpusMeta } | { ok: false; error: CorpusLoadError } {
  if (!existsSync(metaPath)) return { ok: true, meta: {} };
  let raw: string;
  try {
    raw = readFileSync(metaPath, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: {
        code: DEBUG_CORPUS_CODES.META_INVALID,
        message: `Cannot read meta.json: ${msg}`,
        path: metaPath,
      },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: {
        code: DEBUG_CORPUS_CODES.META_INVALID,
        message: `meta.json is not valid JSON: ${msg}`,
        path: metaPath,
      },
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: {
        code: DEBUG_CORPUS_CODES.META_INVALID,
        message: "meta.json must be a JSON object.",
        path: metaPath,
      },
    };
  }
  const o = parsed as Record<string, unknown>;
  const meta: CorpusMeta = {};
  if (typeof o.customerId === "string") meta.customerId = o.customerId;
  if (typeof o.capturedAt === "string") meta.capturedAt = o.capturedAt;
  return { ok: true, meta };
}

function capturedAtEffectiveMs(meta: CorpusMeta, workflowResultPath: string): number {
  if (meta.capturedAt) {
    const t = Date.parse(meta.capturedAt);
    if (!Number.isNaN(t)) return t;
  }
  return mtimeMs(workflowResultPath);
}

export function resolveCorpusRootReal(corpusRoot: string): string {
  return realpathSync(path.resolve(corpusRoot));
}

export function loadCorpusRun(corpusRootReal: string, runId: string): CorpusRunOutcome {
  const runDir = path.join(corpusRootReal, runId);
  let runDirReal: string;
  try {
    runDirReal = realpathSync(runDir);
  } catch {
    return {
      loadStatus: "error",
      runId,
      error: {
        code: DEBUG_CORPUS_CODES.PATH_ESCAPE,
        message: `Run directory does not exist or is unreachable: ${runId}`,
        path: runDir,
      },
      pathsTried: {},
      capturedAtEffectiveMs: 0,
    };
  }

  if (!isPathUnderRoot(corpusRootReal, runDirReal)) {
    return {
      loadStatus: "error",
      runId,
      error: {
        code: DEBUG_CORPUS_CODES.PATH_ESCAPE,
        message: "Resolved run path escapes corpus root.",
        path: runDirReal,
      },
      pathsTried: {},
      capturedAtEffectiveMs: 0,
    };
  }

  const workflowResultPath = path.join(runDirReal, WORKFLOW_RESULT_FILENAME);
  const eventsPath = path.join(runDirReal, EVENTS_FILENAME);
  const metaPath = path.join(runDirReal, META_FILENAME);

  if (!existsSync(workflowResultPath)) {
    return {
      loadStatus: "error",
      runId,
      error: {
        code: DEBUG_CORPUS_CODES.MISSING_WORKFLOW_RESULT,
        message: `Missing ${WORKFLOW_RESULT_FILENAME} under run folder.`,
        path: workflowResultPath,
      },
      pathsTried: { workflowResult: workflowResultPath, events: eventsPath },
      capturedAtEffectiveMs: mtimeMs(eventsPath),
    };
  }

  const metaParsed = parseMetaFile(metaPath);
  if (!metaParsed.ok) {
    return {
      loadStatus: "error",
      runId,
      error: metaParsed.error,
      pathsTried: { workflowResult: workflowResultPath },
      rawPreview: readUtf8Preview(metaPath, 8192),
      capturedAtEffectiveMs: mtimeMs(workflowResultPath),
    };
  }
  const meta = metaParsed.meta;

  let wrRaw: string;
  try {
    wrRaw = readFileSync(workflowResultPath, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      loadStatus: "error",
      runId,
      error: {
        code: DEBUG_CORPUS_CODES.MISSING_WORKFLOW_RESULT,
        message: msg,
        path: workflowResultPath,
      },
      pathsTried: { workflowResult: workflowResultPath },
      capturedAtEffectiveMs: mtimeMs(workflowResultPath),
    };
  }

  let wrParsed: unknown;
  try {
    wrParsed = JSON.parse(wrRaw) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      loadStatus: "error",
      runId,
      error: {
        code: DEBUG_CORPUS_CODES.WORKFLOW_RESULT_JSON,
        message: msg,
        path: workflowResultPath,
      },
      pathsTried: { workflowResult: workflowResultPath, events: eventsPath },
      rawPreview: readUtf8Preview(workflowResultPath, 8192),
      capturedAtEffectiveMs: mtimeMs(workflowResultPath),
      meta,
    };
  }

  if (!validateWorkflowResult(wrParsed)) {
    return {
      loadStatus: "error",
      runId,
      error: {
        code: DEBUG_CORPUS_CODES.WORKFLOW_RESULT_INVALID,
        message: "workflow-result.json failed workflow-result schema validation.",
        path: workflowResultPath,
        details: validateWorkflowResult.errors ?? [],
      },
      pathsTried: { workflowResult: workflowResultPath, events: eventsPath },
      rawPreview: readUtf8Preview(workflowResultPath, 8192),
      capturedAtEffectiveMs: mtimeMs(workflowResultPath),
      meta,
    };
  }

  let workflowResult: WorkflowResult;
  try {
    workflowResult = normalizeToEmittedWorkflowResult(
      wrParsed as import("./types.js").WorkflowEngineResult | WorkflowResult,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      loadStatus: "error",
      runId,
      error: {
        code: DEBUG_CORPUS_CODES.WORKFLOW_RESULT_INVALID,
        message: msg,
        path: workflowResultPath,
      },
      pathsTried: { workflowResult: workflowResultPath, events: eventsPath },
      rawPreview: readUtf8Preview(workflowResultPath, 8192),
      capturedAtEffectiveMs: mtimeMs(workflowResultPath),
      meta,
    };
  }

  if (!existsSync(eventsPath)) {
    return {
      loadStatus: "error",
      runId,
      error: {
        code: DEBUG_CORPUS_CODES.MISSING_EVENTS,
        message: `Missing ${EVENTS_FILENAME} under run folder.`,
        path: eventsPath,
      },
      pathsTried: { workflowResult: workflowResultPath, events: eventsPath },
      capturedAtEffectiveMs: capturedAtEffectiveMs(meta, workflowResultPath),
      meta,
    };
  }

  let load;
  try {
    load = loadEventsForWorkflow(eventsPath, workflowResult.workflowId);
  } catch (e) {
    if (e instanceof TruthLayerError) {
      return {
        loadStatus: "error",
        runId,
        error: {
          code: DEBUG_CORPUS_CODES.EVENTS_LOAD_FAILED,
          message: e.message,
          path: eventsPath,
          details: { truthLayerCode: e.code },
        },
        pathsTried: { workflowResult: workflowResultPath, events: eventsPath },
        rawPreview: readUtf8Preview(eventsPath, 8192),
        capturedAtEffectiveMs: capturedAtEffectiveMs(meta, workflowResultPath),
        meta,
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return {
      loadStatus: "error",
      runId,
      error: {
        code: DEBUG_CORPUS_CODES.EVENTS_LOAD_FAILED,
        message: msg,
        path: eventsPath,
      },
      pathsTried: { workflowResult: workflowResultPath, events: eventsPath },
      rawPreview: readUtf8Preview(eventsPath, 8192),
      capturedAtEffectiveMs: capturedAtEffectiveMs(meta, workflowResultPath),
      meta,
    };
  }

  return {
    loadStatus: "ok",
    runId,
    workflowResult,
    meta,
    capturedAtEffectiveMs: capturedAtEffectiveMs(meta, workflowResultPath),
    paths: { workflowResult: workflowResultPath, events: eventsPath },
    malformedEventLineCount: load.malformedEventLineCount,
  };
}

export function loadAllCorpusRuns(corpusRoot: string): CorpusRunOutcome[] {
  const rootReal = resolveCorpusRootReal(corpusRoot);
  const ids = listCorpusRunIds(rootReal);
  return ids.map((runId) => loadCorpusRun(rootReal, runId));
}

/** Directory containing packaged `debug-ui` (next to this module in dist/). */
export function debugUiDir(): string {
  return path.join(__dirname, "debug-ui");
}
