import { compareUtf16Id } from "../resolveExpectation.js";
import { MAX_ACTIONS, MAX_INPUT_BYTES, FLATTEN_MAX_DEPTH, FLATTEN_MAX_NODES } from "./thresholds.js";
import { stableStringify } from "./canonicalJson.js";

export type RawAction = { toolName: string; params: Record<string, unknown> };

const TOOL_NAME_KEYS = ["toolId", "tool", "name", "function.name", "action"] as const;

function getToolNameKey(obj: Record<string, unknown>): string | undefined {
  for (const k of TOOL_NAME_KEYS) {
    if (k === "function.name") {
      const fn = obj.function;
      if (fn && typeof fn === "object" && fn !== null && !Array.isArray(fn)) {
        const name = (fn as Record<string, unknown>).name;
        if (typeof name === "string" && name.length > 0) return name;
      }
      continue;
    }
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function getParamsObject(obj: Record<string, unknown>): Record<string, unknown> {
  for (const k of ["params", "arguments", "input"] as const) {
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    if (typeof v === "string") {
      const u = v.trim();
      if (u.length === 0) continue;
      if (u.startsWith("{") || u.startsWith("[")) {
        try {
          const parsed = JSON.parse(u) as unknown;
          if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
        } catch {
          /* ignore */
        }
      }
    }
  }
  const out: Record<string, unknown> = {};
  const skip = new Set<string>(["tool_calls", "toolId", "tool", "name", "action", "function"]);
  for (const k of Object.keys(obj)) {
    if (skip.has(k)) continue;
    if (k === "function") continue;
    out[k] = obj[k];
  }
  return out;
}

const RE_CSI = /\u001b\[[\d;?]*[\s-/]*[@-~]/g;

const RE_LOG_P1 = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\s+/;
const RE_LOG_P2 = /^(?:DEBUG|INFO|WARN|WARNING|ERROR|TRACE)\s+/i;
const RE_LOG_P3 = /^\[[^\]]{1,64}\]\s+/;

function stripAnsiCsi(buffer: string): string {
  return buffer.replace(RE_CSI, "");
}

/** L3: salvage timestamp / level / bracket prefixes, then JSON.parse (quick-verify-normative A.5). */
function tryParseLineWithSalvage(line: string): unknown | null {
  const s0 = line.trim();
  if (s0.length === 0) return null;

  let s1 = s0.replace(RE_LOG_P1, "").trim();
  const tryParse = (s: string): unknown | null => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return null;
    }
  };

  let v = tryParse(s1);
  if (v !== null) return v;

  if (RE_LOG_P2.test(s1)) {
    const s2 = s1.replace(RE_LOG_P2, "").trim();
    v = tryParse(s2);
    if (v !== null) return v;
  }

  if (RE_LOG_P3.test(s1)) {
    const s3 = s1.replace(RE_LOG_P3, "").trim();
    v = tryParse(s3);
    if (v !== null) return v;
  }

  return null;
}

function stripMalformedFromReasonCodes(reasonCodes: string[]): string[] {
  return reasonCodes.filter((c) => c !== "MALFORMED_LINE");
}

export type IngestContext = {
  actions: RawAction[];
  reasonCodes: string[];
  malformedLineCount: number;
};

export function createIngestContext(): IngestContext {
  return { actions: [], reasonCodes: [], malformedLineCount: 0 };
}

function pushAction(ctx: IngestContext, toolName: string, params: Record<string, unknown>): void {
  if (ctx.actions.length >= MAX_ACTIONS) {
    if (!ctx.reasonCodes.includes("INGEST_ACTION_CAP")) ctx.reasonCodes.push("INGEST_ACTION_CAP");
    return;
  }
  ctx.actions.push({ toolName, params });
}

export function extractActions(ctx: IngestContext, value: unknown): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const el of value) extractActions(ctx, el);
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  if (Array.isArray(obj.tool_calls)) {
    for (const c of obj.tool_calls) extractActions(ctx, c);
  }
  const tn = getToolNameKey(obj);
  if (tn !== undefined) {
    pushAction(ctx, tn, getParamsObject(obj));
  }
}

function scanBalancedJsonObjects(buffer: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < buffer.length) {
    const start = buffer.indexOf("{", i);
    if (start === -1) break;
    let depth = 0;
    let j = start;
    let inStr: string | null = null;
    let esc = false;
    for (; j < buffer.length; j++) {
      const ch = buffer[j];
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === "\\") {
          esc = true;
          continue;
        }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        continue;
      }
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          out.push(buffer.slice(start, j + 1));
          i = j + 1;
          break;
        }
      }
    }
    if (j >= buffer.length) break;
  }
  return out;
}

export type IngestResult = {
  actions: RawAction[];
  reasonCodes: string[];
  malformedLineCount: number;
  inputTooLarge: boolean;
};

/**
 * Full ingest ladder per docs/quick-verify-normative.md A.5–A.6.
 */
export function ingestActivityUtf8(bufferUtf8: string): IngestResult {
  const bytes = Buffer.byteLength(bufferUtf8, "utf8");
  if (bytes > MAX_INPUT_BYTES) {
    return {
      actions: [],
      reasonCodes: ["INGEST_INPUT_TOO_LARGE"],
      malformedLineCount: 0,
      inputTooLarge: true,
    };
  }

  let buf = bufferUtf8;
  if (buf.charCodeAt(0) === 0xfeff) buf = buf.slice(1);
  buf = stripAnsiCsi(buf);

  if (buf.trim().length === 0) {
    return {
      actions: [],
      reasonCodes: ["INGEST_NO_ACTIONS"],
      malformedLineCount: 0,
      inputTooLarge: false,
    };
  }

  try {
    const root = JSON.parse(buf) as unknown;
    const ctx = createIngestContext();
    extractActions(ctx, root);
    if (ctx.actions.length >= 1) {
      return {
        actions: ctx.actions,
        reasonCodes: ctx.reasonCodes,
        malformedLineCount: ctx.malformedLineCount,
        inputTooLarge: false,
      };
    }
  } catch {
    /* L2 parse throws → L3 */
  }

  const lineCtx = createIngestContext();
  const lines = buf.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t.length === 0) continue;
    const v = tryParseLineWithSalvage(line);
    if (v !== null) {
      extractActions(lineCtx, v);
    } else {
      lineCtx.malformedLineCount++;
      lineCtx.reasonCodes.push("MALFORMED_LINE");
    }
  }
  if (lineCtx.actions.length >= 1) {
    return {
      actions: lineCtx.actions,
      reasonCodes: stripMalformedFromReasonCodes(lineCtx.reasonCodes),
      malformedLineCount: lineCtx.malformedLineCount,
      inputTooLarge: false,
    };
  }

  for (const slice of scanBalancedJsonObjects(buf)) {
    try {
      const v = JSON.parse(slice) as unknown;
      const c = createIngestContext();
      extractActions(c, v);
      if (c.actions.length >= 1) {
        return {
          actions: c.actions,
          reasonCodes: stripMalformedFromReasonCodes(lineCtx.reasonCodes).concat(c.reasonCodes),
          malformedLineCount: lineCtx.malformedLineCount,
          inputTooLarge: false,
        };
      }
    } catch {
      /* ignore */
    }
  }

  const finalRc: string[] = [];
  if (lineCtx.malformedLineCount > 0) {
    for (let i = 0; i < lineCtx.malformedLineCount; i++) finalRc.push("MALFORMED_LINE");
  }
  finalRc.push("INGEST_NO_STRUCTURED_TOOL_ACTIVITY");
  return {
    actions: [],
    reasonCodes: finalRc,
    malformedLineCount: lineCtx.malformedLineCount,
    inputTooLarge: false,
  };
}

export type FlatScalar = string | number | boolean | null;

export function flattenParams(
  params: Record<string, unknown>,
  maxDepth: number = FLATTEN_MAX_DEPTH,
  maxNodes: number = FLATTEN_MAX_NODES,
): { flat: Record<string, FlatScalar>; warnings: string[] } {
  const flat: Record<string, FlatScalar> = {};
  const warnings: string[] = [];
  const seen = new WeakSet<object>();

  function walk(prefix: string, val: unknown, depth: number, counter: { n: number }): void {
    if (counter.n >= maxNodes) {
      warnings.push("FLATTEN_NODE_CAP");
      return;
    }
    counter.n++;
    if (depth > maxDepth) return;
    if (val === null || typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      const key = prefix || "value";
      flat[key] = val as FlatScalar;
      return;
    }
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        const el = val[i];
        if (el !== null && typeof el === "object") {
          walk(prefix ? `${prefix}[${i}]` : `[${i}]`, el, depth + 1, counter);
        }
      }
      return;
    }
    if (typeof val === "object") {
      if (seen.has(val as object)) {
        const key = prefix || "value";
        flat[key] = null;
        return;
      }
      seen.add(val as object);
      const o = val as Record<string, unknown>;
      const keys = Object.keys(o).sort(compareUtf16Id);
      for (const k of keys) {
        const p = prefix ? `${prefix}.${k}` : k;
        walk(p, o[k], depth + 1, counter);
      }
    }
  }

  const counter = { n: 0 };
  walk("", params, 0, counter);
  return { flat, warnings };
}

export function dedupeActions(
  actions: RawAction[],
): { unique: Array<{ toolName: string; flat: Record<string, FlatScalar> }>; droppedWarnings: string[] } {
  const droppedWarnings: string[] = [];
  const seen = new Map<string, { toolName: string; flat: Record<string, FlatScalar> }>();
  for (const a of actions) {
    const { flat } = flattenParams(a.params, FLATTEN_MAX_DEPTH, FLATTEN_MAX_NODES);
    const key = stableStringify({ toolName: a.toolName, flat });
    if (seen.has(key)) {
      droppedWarnings.push("DEDUPE_DROPPED");
      continue;
    }
    seen.set(key, { toolName: a.toolName, flat });
  }
  return { unique: [...seen.values()], droppedWarnings };
}
