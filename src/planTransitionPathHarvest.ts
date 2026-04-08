/**
 * Deterministic path citation harvest for plan-transition (derived_citations).
 * Normative contract: docs/workflow-verifier.md — Plan transition validation.
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

const FRAGMENT_SPLIT_RE = /\.\s+/g;

/** Obligation H2 titles: Implementation, Deliverables, Testing, Documentation, Validation (and common prefixes/suffixes). */
export const PLAN_TRANSITION_OBLIGATION_H2_TITLE_RE =
  /^(?:.{0,120}?\b)?(implementation|deliverables|testing|documentation|validation)\b(?:\s|[:\u2014\u2013\-]|$)/i;

/** Reference-only lines/fragments in obligation sections: do not harvest paths from these. */
export const PLAN_TRANSITION_REFERENCE_ONLY_LINE_RE =
  /\b(?:same\s+pattern|same\s+shape\s+as|seeded\s+from|required\s+setup|use\s+the\s+same|similar\s+to|mirrors(?:\s+existing)?|for\s+example|hypothetical|chosen\s+in\s+fixture)\b|(?:e\.g\.|i\.e\.)(?=\s|,|$)/i;

/** Strong action verbs: required for paths under STRONG_ROOT_PREFIXES, and one branch for WEAK roots. */
export const PLAN_TRANSITION_STRONG_ACTION_RE =
  /\b(add|adds|adding|create|created|creates|extend|extends|update|updates|modify|modifies|change|changes|introduce|introduces|merge|merges|delete|deletes|remove|removes|implement|implements|adjust|adjusts|sync|syncs|refactor|refactors|wire(?!\s+schema)|wires|improve|improves|touch|touches|split|splits|move|moves|rename|renames)\b/i;

export const PLAN_TRANSITION_NORMATIVE_MODAL_RE = /\b(must|shall|required\s+to)\b/i;

/** Numbered deliverable fragment (starts optional whitespace, digit(s), dot, whitespace). */
export const PLAN_TRANSITION_NUMBERED_FRAGMENT_RE = /^\s*\d+\.\s/;

export const STRONG_ROOT_PREFIXES = ["examples/", "docs/", "schemas/", "plans/"] as const;

export const WEAK_ROOT_PREFIXES = ["src/", "test/", "debug-ui/"] as const;

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

function pathRootKind(path: string): "strong" | "weak" | null {
  for (const p of STRONG_ROOT_PREFIXES) {
    if (path.startsWith(p)) return "strong";
  }
  for (const p of WEAK_ROOT_PREFIXES) {
    if (path.startsWith(p)) return "weak";
  }
  return null;
}

function pathPassesFragmentGate(path: string, fragment: string): boolean {
  const kind = pathRootKind(path);
  if (kind === null) return false;
  if (kind === "strong") {
    return PLAN_TRANSITION_STRONG_ACTION_RE.test(fragment);
  }
  return (
    PLAN_TRANSITION_STRONG_ACTION_RE.test(fragment) ||
    PLAN_TRANSITION_NORMATIVE_MODAL_RE.test(fragment) ||
    PLAN_TRANSITION_NUMBERED_FRAGMENT_RE.test(fragment)
  );
}

function splitLineIntoFragments(line: string): string[] {
  return line
    .split(FRAGMENT_SPLIT_RE)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

function harvestFromFragment(fragment: string, into: Set<string>): void {
  if (PLAN_TRANSITION_REFERENCE_ONLY_LINE_RE.test(fragment)) return;
  const candidates = new Set<string>();
  harvestFromText(fragment, candidates);
  for (const p of candidates) {
    if (pathPassesFragmentGate(p, fragment)) into.add(p);
  }
}

function harvestFromTodoSegment(segment: string, into: Set<string>): void {
  if (PLAN_TRANSITION_REFERENCE_ONLY_LINE_RE.test(segment)) return;
  harvestFromFragment(segment, into);
}

function walkObligationLines(
  body: string,
  onLine: (line: string, sectionIsTesting: boolean) => void,
): void {
  const lines = body.split("\n");
  let inObligation = false;
  let currentTitle = "";
  let inFence = false;

  for (const line of lines) {
    if (inFence) {
      if (/^```\s*$/.test(line)) inFence = false;
      continue;
    }
    if (/^```\S*\s*$/.test(line)) {
      inFence = true;
      continue;
    }

    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      const title = h2[1]!.trim();
      inObligation = PLAN_TRANSITION_OBLIGATION_H2_TITLE_RE.test(title);
      currentTitle = title;
      continue;
    }

    if (!inObligation) continue;

    const sectionIsTesting = /^testing\b/i.test(currentTitle.trim());
    onLine(line, sectionIsTesting);
  }
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

function splitTodoIntoSegments(content: string): string[] {
  const trimmed = content.trim();
  if (trimmed.length === 0) return [];
  if (!trimmed.includes("; ")) return [trimmed];
  return trimmed
    .split("; ")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Returns sorted unique repo-relative paths (UTF-16 lexicographic) from obligation H2 sections
 * (Implementation, Deliverables, Testing, Documentation, Validation) plus front matter todos[].content.
 */
export function harvestQualifyingPathsFromPlan(md: string, fm: Record<string, unknown>): string[] {
  const m = stripUtf8Bom(md);
  const body = extractMarkdownBodyAfterFrontMatter(m).replace(/\r\n/g, "\n");
  const into = new Set<string>();

  walkObligationLines(body, (line, sectionIsTesting) => {
    if (PLAN_TRANSITION_REFERENCE_ONLY_LINE_RE.test(line)) return;
    if (sectionIsTesting && line.includes("Expect:")) return;

    const fragments = splitLineIntoFragments(line);
    if (fragments.length === 0) return;
    for (const f of fragments) {
      harvestFromFragment(f, into);
    }
  });

  for (const todo of collectTodoContentStrings(fm)) {
    for (const seg of splitTodoIntoSegments(todo)) {
      harvestFromTodoSegment(seg, into);
    }
  }

  return [...into].sort();
}
