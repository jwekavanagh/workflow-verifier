import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import YAML from "yaml";
import { aggregateWorkflow } from "./aggregate.js";
import { CLI_OPERATIONAL_CODES } from "./cliOperationalCodes.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import { TruthLayerError } from "./truthLayerError.js";
import type { Reason, StepOutcome, WorkflowResult } from "./types.js";
import { finalizeEmittedWorkflowResult } from "./workflowTruthReport.js";
import { resolveVerificationPolicyInput } from "./verificationPolicy.js";
import { PLAN_TRANSITION_WORKFLOW_ID } from "./planTransitionConstants.js";

export { PLAN_TRANSITION_WORKFLOW_ID } from "./planTransitionConstants.js";

const PICOMATCH_OPTIONS = { dot: true, nocase: false } as const;

const EVIDENCE_CAP = 50;

const PLAN_INSUFFICIENT_SPEC_DETAIL =
  "No machine-checkable plan transition rules were found. Add planValidation (schemaVersion: 1, rules) under YAML front matter, or add exactly one heading \"Repository transition validation\" followed by a single yaml or yml fenced block with the same structure.";

const PLAN_BODY_FIRST_FENCE_MUST_BE_YAML =
  "The first fenced code block in the \"Repository transition validation\" section must use the yaml or yml language tag.";

const REPOSITORY_TRANSITION_HEADING_LINE = /^#{1,6}\s+Repository transition validation\s*$/;

export type TransitionRulesProvenance = "front_matter" | "body_section";

export type PlanDiffRowKind =
  | "add"
  | "modify"
  | "delete"
  | "rename"
  | "copy"
  | "type_change"
  | "unmerged";

export type PlanDiffRow = {
  rowKind: PlanDiffRowKind;
  paths: [string] | [string, string];
};

export const PLAN_RULE_CODES = {
  ROW_KIND_MISMATCH: "PLAN_RULE_ROW_KIND_MISMATCH",
  FORBIDDEN_ROW: "PLAN_RULE_FORBIDDEN_ROW",
  REQUIRED_ROW_MISSING: "PLAN_RULE_REQUIRED_ROW_MISSING",
  ALLOWLIST_VIOLATION: "PLAN_RULE_ALLOWLIST_VIOLATION",
  RENAME_MISMATCH: "PLAN_RULE_RENAME_MISMATCH",
} as const;

function normalizePathSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Parse `git version 2.43.0.windows.1` → [2,43,0] or null. */
export function parseGitVersionTriple(stdout: string): [number, number, number] | null {
  const m = stdout.trim().match(/git version (\d+)\.(\d+)\.(\d+)/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function versionGte(a: [number, number, number], b: [number, number, number]): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] >= b[2];
}

const MIN_GIT: [number, number, number] = [2, 30, 0];

export function assertGitVersionAtLeast_2_30(): void {
  let out: string;
  try {
    out = execFileSync("git", ["--version"], { encoding: "utf8", windowsHide: true });
  } catch (e) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_TRANSITION_GIT_FAILED,
      `Could not run git --version: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
  const triple = parseGitVersionTriple(out);
  if (!triple || !versionGte(triple, MIN_GIT)) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_TRANSITION_GIT_TOO_OLD,
      `Git >= 2.30.0 required for plan-transition; got: ${out.trim() || "(empty)"}`,
    );
  }
}

export function preflightPatternString(s: string, label: string): void {
  if (s.length === 0) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_INVALID_PATTERN,
      `${label}: pattern must be non-empty.`,
    );
  }
  if (s.includes("..")) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_INVALID_PATTERN,
      `${label}: pattern must not contain "..".`,
    );
  }
  if (s.startsWith("/")) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_INVALID_PATTERN,
      `${label}: pattern must not start with "/".`,
    );
  }
  if (/^[A-Za-z]:/.test(s)) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_INVALID_PATTERN,
      `${label}: pattern must not be a Windows drive path.`,
    );
  }
  if (s.includes("\0")) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_INVALID_PATTERN,
      `${label}: pattern must not contain NUL.`,
    );
  }
}

function pathMatchesPattern(filePath: string, pattern: string): boolean {
  const p = normalizePathSlashes(filePath);
  return picomatch.isMatch(p, pattern, PICOMATCH_OPTIONS);
}

function rowTouchesPattern(row: PlanDiffRow, pattern: string): boolean {
  return row.paths.some((pt) => pathMatchesPattern(pt, pattern));
}

function rowMatchesPatternAndKinds(
  row: PlanDiffRow,
  pattern: string,
  kinds: Set<PlanDiffRowKind>,
): boolean {
  return rowTouchesPattern(row, pattern) && kinds.has(row.rowKind);
}

function allPathsInRow(row: PlanDiffRow): string[] {
  return [...row.paths];
}

function pathMatchesAnyAllowlist(filePath: string, allowPatterns: string[]): boolean {
  return allowPatterns.some((pat) => pathMatchesPattern(filePath, pat));
}

type PlanRule =
  | {
      id: string;
      kind: "matchingRowsMustHaveRowKinds";
      description?: string;
      pattern: string;
      rowKinds: PlanDiffRowKind[];
    }
  | { id: string; kind: "forbidMatchingRows"; description?: string; pattern: string }
  | {
      id: string;
      kind: "requireMatchingRow";
      description?: string;
      pattern: string;
      rowKinds: PlanDiffRowKind[];
    }
  | {
      id: string;
      kind: "allChangedPathsMustMatchAllowlist";
      description?: string;
      allowPatterns: string[];
    }
  | {
      id: string;
      kind: "requireRenameFromTo";
      description?: string;
      fromPattern: string;
      toPattern: string;
      includeCopy: boolean;
    };

export function preflightAllPlanPatterns(rules: PlanRule[]): void {
  for (let ri = 0; ri < rules.length; ri++) {
    const r = rules[ri]!;
    if (r.kind === "matchingRowsMustHaveRowKinds" || r.kind === "forbidMatchingRows" || r.kind === "requireMatchingRow") {
      preflightPatternString(r.pattern, `rules[${ri}].pattern`);
    } else if (r.kind === "allChangedPathsMustMatchAllowlist") {
      for (let ai = 0; ai < r.allowPatterns.length; ai++) {
        preflightPatternString(r.allowPatterns[ai]!, `rules[${ri}].allowPatterns[${ai}]`);
      }
    } else if (r.kind === "requireRenameFromTo") {
      preflightPatternString(r.fromPattern, `rules[${ri}].fromPattern`);
      preflightPatternString(r.toPattern, `rules[${ri}].toPattern`);
    }
  }
}

/** Parse NUL-delimited `git diff -z --name-status` output (Git 2.30.0+). */
export function parseGitNameStatusZ(buf: Buffer): PlanDiffRow[] {
  const rows: PlanDiffRow[] = [];
  let p = 0;
  const len = buf.length;

  const readStr = (start: number): [string, number] => {
    const z = buf.indexOf(0, start);
    if (z === -1) {
      throw new TruthLayerError(
        CLI_OPERATIONAL_CODES.PLAN_TRANSITION_GIT_PARSE,
        "git name-status -z: truncated stream (missing NUL).",
      );
    }
    return [buf.subarray(start, z).toString("utf8"), z + 1];
  };

  while (p < len) {
    const [status, pAfterStatus] = readStr(p);
    p = pAfterStatus;
    if (status === "") {
      break;
    }

    const mapSingle = (k: PlanDiffRowKind, pathStr: string): PlanDiffRow => ({
      rowKind: k,
      paths: [normalizePathSlashes(pathStr)],
    });

    if (/^[AMDTU]$/.test(status)) {
      const [pathStr, p2] = readStr(p);
      p = p2;
      const k =
        status === "A"
          ? "add"
          : status === "M"
            ? "modify"
            : status === "D"
              ? "delete"
              : status === "T"
                ? "type_change"
                : "unmerged";
      rows.push(mapSingle(k, pathStr));
      continue;
    }

    if (/^R\d+$/.test(status)) {
      const [oldP, p1] = readStr(p);
      p = p1;
      const [newP, p2] = readStr(p);
      p = p2;
      rows.push({
        rowKind: "rename",
        paths: [normalizePathSlashes(oldP), normalizePathSlashes(newP)],
      });
      continue;
    }

    if (/^C\d+$/.test(status)) {
      const [oldP, p1] = readStr(p);
      p = p1;
      const [newP, p2] = readStr(p);
      p = p2;
      rows.push({
        rowKind: "copy",
        paths: [normalizePathSlashes(oldP), normalizePathSlashes(newP)],
      });
      continue;
    }

    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_TRANSITION_GIT_PARSE,
      `git name-status -z: unknown status token ${JSON.stringify(status)}.`,
    );
  }

  return rows;
}

export function extractPlanFrontMatterYamlSource(md: string): string {
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
  return rest.slice(0, end);
}

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

function markdownHeadingLevel(line: string): number | null {
  const m = /^(#{1,6})\s/.exec(line);
  return m ? m[1]!.length : null;
}

function extractFencedBlocks(section: string): Array<{ info: string; inner: string }> {
  const lines = section.split("\n");
  const blocks: Array<{ info: string; inner: string }> = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const open = /^```(\S*)\s*$/.exec(line);
    if (!open) {
      i += 1;
      continue;
    }
    const info = open[1] ?? "";
    i += 1;
    const innerLines: string[] = [];
    let closed = false;
    while (i < lines.length) {
      if (/^```\s*$/.test(lines[i]!)) {
        closed = true;
        i += 1;
        break;
      }
      innerLines.push(lines[i]!);
      i += 1;
    }
    if (closed) {
      blocks.push({ info, inner: innerLines.join("\n") });
    }
  }
  return blocks;
}

function validatePlanValidationCoreOrThrow(value: unknown, labelPrefix: string): PlanRule[] {
  const v = loadSchemaValidator("plan-validation-core");
  if (!v(value)) {
    const msg = `${labelPrefix}${JSON.stringify(v.errors ?? [])}`;
    throw new TruthLayerError(CLI_OPERATIONAL_CODES.PLAN_VALIDATION_SCHEMA_INVALID, msg);
  }
  return (value as { rules: PlanRule[] }).rules;
}

export function loadPlanTransitionRules(rawMarkdown: string): {
  rules: PlanRule[];
  source: TransitionRulesProvenance;
} {
  const md = stripUtf8Bom(rawMarkdown);
  const yamlSrc = extractPlanFrontMatterYamlSource(md);
  let doc: unknown;
  try {
    doc = YAML.parse(yamlSrc);
  } catch (e) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_YAML_INVALID,
      `YAML parse failed: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
  const fm =
    doc && typeof doc === "object" && doc !== null ? (doc as Record<string, unknown>) : {};
  if (Object.prototype.hasOwnProperty.call(fm, "planValidation")) {
    const rules = validatePlanValidationCoreOrThrow(fm.planValidation, "front matter planValidation:");
    return { rules, source: "front_matter" };
  }

  const body = extractMarkdownBodyAfterFrontMatter(md).replace(/\r\n/g, "\n");
  const lines = body.split("\n");
  const headingIndices: number[] = [];
  for (let li = 0; li < lines.length; li++) {
    if (REPOSITORY_TRANSITION_HEADING_LINE.test(lines[li]!)) headingIndices.push(li);
  }
  if (headingIndices.length === 0) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_INSUFFICIENT_SPEC,
      PLAN_INSUFFICIENT_SPEC_DETAIL,
    );
  }
  if (headingIndices.length > 1) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_AMBIGUOUS_BODY_RULES,
      'Duplicate "Repository transition validation" headings are not allowed when loading rules from the plan body.',
    );
  }
  const headingLineIdx = headingIndices[0]!;
  const level = markdownHeadingLevel(lines[headingLineIdx]!);
  if (level === null) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_INSUFFICIENT_SPEC,
      PLAN_INSUFFICIENT_SPEC_DETAIL,
    );
  }
  const sectionLines: string[] = [];
  for (let li = headingLineIdx + 1; li < lines.length; li++) {
    const line = lines[li]!;
    const lvl = markdownHeadingLevel(line);
    if (lvl !== null && lvl <= level) break;
    sectionLines.push(line);
  }
  const section = sectionLines.join("\n");
  const blocks = extractFencedBlocks(section);
  if (blocks.length === 0) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_INSUFFICIENT_SPEC,
      PLAN_INSUFFICIENT_SPEC_DETAIL,
    );
  }
  const first = blocks[0]!;
  if (first.info !== "yaml" && first.info !== "yml") {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_INSUFFICIENT_SPEC,
      PLAN_BODY_FIRST_FENCE_MUST_BE_YAML,
    );
  }
  const yamlFenceCount = blocks.filter((b) => b.info === "yaml" || b.info === "yml").length;
  if (yamlFenceCount > 1) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_AMBIGUOUS_BODY_RULES,
      'Multiple yaml or yml fenced blocks in the "Repository transition validation" section are not allowed.',
    );
  }
  let parsed: unknown;
  try {
    parsed = YAML.parse(first.inner);
  } catch (e) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_VALIDATION_YAML_INVALID,
      `body Repository transition validation: YAML parse failed: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
  const rules = validatePlanValidationCoreOrThrow(
    parsed,
    "body Repository transition validation:",
  );
  return { rules, source: "body_section" };
}

export function parseAndValidatePlanDocument(planFilePath: string): {
  rules: PlanRule[];
  source: TransitionRulesProvenance;
} {
  const raw = readFileSync(planFilePath, "utf8");
  return loadPlanTransitionRules(raw);
}

export function assertPlanPathInsideRepo(repoRoot: string, planPath: string): string {
  const repoReal = realpathSync(path.resolve(repoRoot));
  const planResolved = path.resolve(planPath);
  const planReal = realpathSync(planResolved);
  const rel = path.relative(repoReal, planReal);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_PATH_OUTSIDE_REPO,
      `--plan must resolve inside the repository root.`,
    );
  }
  return planReal;
}

export function resolveCommitSha(repo: string, ref: string): string {
  try {
    const out = execFileSync(
      "git",
      ["-C", repo, "rev-parse", "--verify", `${ref}^{commit}`],
      { encoding: "utf8", windowsHide: true },
    );
    return out.trim();
  } catch (e) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_TRANSITION_BAD_REF,
      `Could not resolve ref ${JSON.stringify(ref)} to a commit: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
}

export function readGitNameStatusZ(repo: string, before: string, after: string): Buffer {
  try {
    return execFileSync(
      "git",
      ["-C", repo, "diff", "--no-ext-diff", "-z", "--name-status", `${before}..${after}`],
      { encoding: "buffer", windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    ) as Buffer;
  } catch (e) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.PLAN_TRANSITION_GIT_FAILED,
      `git diff failed: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
}

function capEvidence<T>(arr: T[]): { items: T[]; truncated: boolean } {
  if (arr.length <= EVIDENCE_CAP) return { items: arr, truncated: false };
  return { items: arr.slice(0, EVIDENCE_CAP), truncated: true };
}

function evaluateRule(rows: PlanDiffRow[], rule: PlanRule, seq: number): StepOutcome {
  const baseNarrative =
    rule.description?.trim() ||
    `${rule.kind} (${rule.id})`;

  const emptyParams = "{}";

  const ok = (extra?: Record<string, unknown>): StepOutcome => ({
    seq,
    toolId: `plan_transition.rule.${rule.id}`,
    intendedEffect: { narrative: baseNarrative },
    observedExecution: { paramsCanonical: emptyParams },
    verificationRequest: null,
    status: "verified",
    reasons: [],
    evidenceSummary: { planTransition: true as const, ruleId: rule.id, ...(extra ?? {}) },
    repeatObservationCount: 1,
    evaluatedObservationOrdinal: 1,
  });

  const bad = (code: string, message: string, extra?: Record<string, unknown>): StepOutcome => ({
    seq,
    toolId: `plan_transition.rule.${rule.id}`,
    intendedEffect: { narrative: baseNarrative },
    observedExecution: { paramsCanonical: emptyParams },
    verificationRequest: null,
    status: "inconsistent",
    reasons: [{ code, message }],
    evidenceSummary: { planTransition: true as const, ruleId: rule.id, ...(extra ?? {}) },
    repeatObservationCount: 1,
    evaluatedObservationOrdinal: 1,
  });

  if (rule.kind === "matchingRowsMustHaveRowKinds") {
    const allowed = new Set(rule.rowKinds);
    const violating: PlanDiffRow[] = [];
    for (const row of rows) {
      if (rowTouchesPattern(row, rule.pattern) && !allowed.has(row.rowKind)) {
        violating.push(row);
      }
    }
    if (violating.length > 0) {
      const c = capEvidence(violating);
      return bad(
        PLAN_RULE_CODES.ROW_KIND_MISMATCH,
        `Rows matching pattern must have rowKinds ${[...allowed].join(", ")}; found violating rows.`,
        { violatingRows: c.items, truncated: c.truncated },
      );
    }
    return ok({ rowCount: rows.length });
  }

  if (rule.kind === "forbidMatchingRows") {
    const forbidden: PlanDiffRow[] = [];
    for (const row of rows) {
      if (rowTouchesPattern(row, rule.pattern)) forbidden.push(row);
    }
    if (forbidden.length > 0) {
      const c = capEvidence(forbidden);
      return bad(
        PLAN_RULE_CODES.FORBIDDEN_ROW,
        `No diff row may match pattern ${JSON.stringify(rule.pattern)}.`,
        { violatingRows: c.items, truncated: c.truncated },
      );
    }
    return ok();
  }

  if (rule.kind === "requireMatchingRow") {
    const kinds = new Set(rule.rowKinds);
    const hit = rows.some((row) => rowMatchesPatternAndKinds(row, rule.pattern, kinds));
    if (!hit) {
      return bad(
        PLAN_RULE_CODES.REQUIRED_ROW_MISSING,
        `Expected at least one diff row matching pattern ${JSON.stringify(rule.pattern)} with rowKinds ${[...kinds].join(", ")}.`,
        { rowCount: rows.length },
      );
    }
    return ok();
  }

  if (rule.kind === "allChangedPathsMustMatchAllowlist") {
    const failures: Array<{ path: string; rowKind: PlanDiffRowKind }> = [];
    for (const row of rows) {
      for (const pt of allPathsInRow(row)) {
        if (!pathMatchesAnyAllowlist(pt, rule.allowPatterns)) {
          failures.push({ path: pt, rowKind: row.rowKind });
        }
      }
    }
    if (failures.length > 0) {
      const c = capEvidence(failures);
      return bad(
        PLAN_RULE_CODES.ALLOWLIST_VIOLATION,
        "Every changed path must match at least one allowPatterns entry.",
        { allowlistFailures: c.items, truncated: c.truncated },
      );
    }
    return ok();
  }

  if (rule.kind === "requireRenameFromTo") {
    const kinds: PlanDiffRowKind[] = rule.includeCopy ? ["rename", "copy"] : ["rename"];
    const kindSet = new Set(kinds);
    const hit = rows.some((row) => {
      if (!kindSet.has(row.rowKind) || row.paths.length !== 2) return false;
      const [oldP, newP] = row.paths;
      return pathMatchesPattern(oldP, rule.fromPattern) && pathMatchesPattern(newP, rule.toPattern);
    });
    if (!hit) {
      return bad(
        PLAN_RULE_CODES.RENAME_MISMATCH,
        `Expected ${kinds.join(" or ")} from ${JSON.stringify(rule.fromPattern)} to ${JSON.stringify(rule.toPattern)}.`,
        { rowCount: rows.length },
      );
    }
    return ok();
  }

  const _exhaustive: never = rule;
  return _exhaustive;
}

export function evaluatePlanRules(rows: PlanDiffRow[], rules: PlanRule[]): StepOutcome[] {
  return rules.map((rule, i) => evaluateRule(rows, rule, i + 1));
}

export type BuildPlanTransitionInput = {
  repoRoot: string;
  beforeRef: string;
  afterRef: string;
  planPath: string;
  workflowId?: string;
};

export function buildPlanTransitionWorkflowResult(
  input: BuildPlanTransitionInput,
): { workflowResult: WorkflowResult; transitionRulesProvenance: TransitionRulesProvenance } {
  assertGitVersionAtLeast_2_30();
  const repo = path.resolve(input.repoRoot);
  const planReal = assertPlanPathInsideRepo(repo, input.planPath);
  const { rules, source } = parseAndValidatePlanDocument(planReal);
  preflightAllPlanPatterns(rules);

  const beforeSha = resolveCommitSha(repo, input.beforeRef);
  const afterSha = resolveCommitSha(repo, input.afterRef);
  const diffBuf = readGitNameStatusZ(repo, beforeSha, afterSha);
  const rows = parseGitNameStatusZ(diffBuf);

  const steps = evaluatePlanRules(rows, rules);
  const workflowId = input.workflowId ?? PLAN_TRANSITION_WORKFLOW_ID;
  const verificationPolicy = resolveVerificationPolicyInput({
    consistencyMode: "strong",
    verificationWindowMs: 0,
    pollIntervalMs: 0,
  });
  const engine = aggregateWorkflow(workflowId, steps, [], verificationPolicy, { kind: "normal" });
  return {
    workflowResult: finalizeEmittedWorkflowResult(engine),
    transitionRulesProvenance: source,
  };
}

export function sha256HexOfFile(filePath: string): string {
  const buf = readFileSync(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

export function buildPlanTransitionEventsNdjson(input: {
  workflowId: string;
  beforeRef: string;
  afterRef: string;
  beforeCommitSha: string;
  afterCommitSha: string;
  planResolvedPath: string;
  planSha256: string;
  transitionRulesSource: TransitionRulesProvenance;
}): Buffer {
  const line = {
    schemaVersion: 1,
    workflowId: input.workflowId,
    seq: 0,
    type: "tool_observed",
    toolId: "plan_transition.meta",
    params: {
      beforeRef: input.beforeRef,
      afterRef: input.afterRef,
      beforeCommitSha: input.beforeCommitSha,
      afterCommitSha: input.afterCommitSha,
      planResolvedPath: input.planResolvedPath,
      planSha256: input.planSha256,
      transitionRulesSource: input.transitionRulesSource,
    },
  };
  return Buffer.from(`${JSON.stringify(line)}\n`, "utf8");
}
