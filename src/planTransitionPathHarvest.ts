/**
 * Deterministic path citation harvest for plan-transition (derived_citations).
 * Normative contract: docs/execution-truth-layer.md — Plan transition validation.
 */

import { CLI_OPERATIONAL_CODES } from "./cliOperationalCodes.js";
import { TruthLayerError } from "./truthLayerError.js";

const ALLOWED_EXT = new Set(["ts", "tsx", "js", "mjs", "json", "md", "sql"]);

const ROOT_ALT = "src|schemas|examples|docs|test|debug-ui|plans";

/** Match start of a root segment; group 1 is '' or '/', group 2 is root name. */
const ANCHOR_RE = new RegExp(`(^|/)((?:${ROOT_ALT}))\\/`, "g");

const QUALIFIED_PATH_RE = new RegExp(
  `^((?:${ROOT_ALT})/[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*)\\.([^.]+)$`,
);

const LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g;

const BACKTICK_PATH_RE = new RegExp(
  "`((?:" + ROOT_ALT + ")/[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*\\.([a-zA-Z0-9]+))`",
  "g",
);

/** Obligation H2 titles: Implementation, Testing, Documentation, Validation (and common prefixes/suffixes). */
export const PLAN_TRANSITION_OBLIGATION_H2_TITLE_RE =
  /^(?:.{0,120}?\b)?(implementation|testing|documentation|validation)\b(?:\s|[:\u2014\u2013\-]|$)/i;

/** Reference-only lines in obligation sections: do not harvest paths from these lines (todos exempt). */
export const PLAN_TRANSITION_REFERENCE_ONLY_LINE_RE =
  /\b(?:same\s+shape\s+as|similar\s+to|mirrors(?:\s+existing)?|for\s+example|hypothetical|chosen\s+in\s+fixture)\b|(?:e\.g\.|i\.e\.)(?=\s|,|$)/i;

function stripUtf8Bom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function extractMarkdownBodyAfterFrontMatter(md: string): string {
  if (!md.startsWith("---\n") && !md.startsWith("---\r\n")) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_NO_FRONT_MATTER,
      "Plan.md must start with YAML front matter (--- on line 1).",
    );
  }
  const rest = md.slice(3).replace(/^\r?\n/, "");
  const end = rest.search(/\n---\s*(?:\r?\n|$)/);
  if (end === -1) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_NO_FRONT_MATTER,
      "Plan.md front matter must end with a closing --- line.",
    );
  }
  const afterClose = rest.slice(end);
  const delim = afterClose.match(/^\r?\n---\s*(?:\r?\n|$)/);
  if (!delim) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_NO_FRONT_MATTER,
      "Plan.md front matter must end with a closing --- line.",
    );
  }
  return afterClose.slice(delim[0].length);
}

/** Remove fenced blocks (opening ^```(\S*)\s*$, closing ^```\s*$) inclusive. */
export function stripAllFencedBlocks(section: string): string {
  const lines = section.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const open = /^```(\S*)\s*$/.exec(line);
    if (!open) {
      out.push(line);
      i += 1;
      continue;
    }
    i += 1;
    while (i < lines.length) {
      if (/^```\s*$/.test(lines[i]!)) {
        i += 1;
        break;
      }
      i += 1;
    }
  }
  return out.join("\n");
}

function trimAsciiSpaceTab(s: string): string {
  return s.replace(/^[\t ]+|[\t ]+$/g, "");
}

function normalizeAndQualify(rawCandidate: string): string | null {
  let R = trimAsciiSpaceTab(rawCandidate);
  if (R.length === 0) return null;

  if (/^file:/i.test(R)) {
    try {
      const url = new URL(R);
      R = decodeURIComponent(url.pathname);
    } catch {
      /* keep R as literal */
    }
  }

  R = R.replace(/\\/g, "/");
  while (R.startsWith("./")) {
    R = R.slice(2);
  }

  if (
    R.includes("..") ||
    R.includes("\0") ||
    /[\u0000-\u001f]/.test(R) ||
    /[\t ]/.test(R) ||
    R.includes("?") ||
    R.includes("#")
  ) {
    return null;
  }

  let bestStart = -1;
  ANCHOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ANCHOR_RE.exec(R)) !== null) {
    const rootStart = m.index + m[1]!.length;
    if (rootStart >= bestStart) bestStart = rootStart;
  }
  if (bestStart < 0) return null;

  const P = R.slice(bestStart);
  if (P.includes("//")) return null;

  const pm = QUALIFIED_PATH_RE.exec(P);
  if (!pm) return null;
  const ext = pm[2]!.toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  /** Group 1 is the full path without the final `.ext` (regex separates extension in group 2). */
  return `${pm[1]}.${ext}`;
}

function extractLinkTargets(text: string): string[] {
  const out: string[] = [];
  LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(text)) !== null) {
    let cand = m[2]!;
    if (cand.startsWith("<") && cand.endsWith(">") && cand.length >= 2) {
      cand = cand.slice(1, -1);
    }
    out.push(cand);
  }
  return out;
}

function extractBacktickPaths(text: string): string[] {
  const out: string[] = [];
  BACKTICK_PATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BACKTICK_PATH_RE.exec(text)) !== null) {
    out.push(m[1]!);
  }
  return out;
}

function harvestFromText(text: string, into: Set<string>): void {
  for (const c of extractLinkTargets(text)) {
    const q = normalizeAndQualify(c);
    if (q) into.add(q);
  }
  for (const c of extractBacktickPaths(text)) {
    const q = normalizeAndQualify(c);
    if (q) into.add(q);
  }
}

/**
 * Concatenate bodies of H2 sections whose titles match PLAN_TRANSITION_OBLIGATION_H2_TITLE_RE,
 * in document order, joined with `\n` between sections.
 */
function extractObligationBodyConcat(body: string): string {
  const lines = body.split("\n");
  const parts: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (!h2) {
      i += 1;
      continue;
    }
    const title = h2[1]!.trim();
    if (!PLAN_TRANSITION_OBLIGATION_H2_TITLE_RE.test(title)) {
      i += 1;
      continue;
    }
    i += 1;
    const chunk: string[] = [];
    while (i < lines.length && !/^##\s+/.test(lines[i]!)) {
      chunk.push(lines[i]!);
      i += 1;
    }
    parts.push(chunk.join("\n"));
  }
  return parts.join("\n");
}

function collectTodoContentStrings(fm: Record<string, unknown>): string[] {
  const raw = fm.todos;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (t && typeof t === "object" && typeof (t as { content?: unknown }).content === "string") {
      out.push((t as { content: string }).content);
    }
  }
  return out;
}

/**
 * Returns sorted unique repo-relative paths (UTF-16 lexicographic) from obligation H2 sections
 * (Implementation, Testing, Documentation, Validation) plus front matter todos[].content.
 */
export function harvestQualifyingPathsFromPlan(md: string, fm: Record<string, unknown>): string[] {
  const m = stripUtf8Bom(md);
  const body = extractMarkdownBodyAfterFrontMatter(m).replace(/\r\n/g, "\n");
  const obligationConcat = extractObligationBodyConcat(body);
  const obligationScan = stripAllFencedBlocks(obligationConcat);
  const into = new Set<string>();
  for (const line of obligationScan.split("\n")) {
    if (PLAN_TRANSITION_REFERENCE_ONLY_LINE_RE.test(line)) continue;
    harvestFromText(line, into);
  }
  for (const todo of collectTodoContentStrings(fm)) {
    harvestFromText(todo, into);
  }
  return [...into].sort();
}
