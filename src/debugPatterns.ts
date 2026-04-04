import {
  buildRunComparisonReport,
  perRunActionableFromWorkflowResult,
  recurrenceSignature,
  type RunComparisonReport,
} from "./runComparison.js";
import type { StepOutcome, WorkflowResult } from "./types.js";
import type { CorpusRunLoadedOk, CorpusRunOutcome } from "./debugCorpus.js";
import type { RunListItem } from "./debugRunIndex.js";
import { matchesRunListQuery, type RunListQuery } from "./debugRunFilters.js";

export const CORPUS_PATTERNS_MAX_MATCH = 10_000;
export const PATTERNS_PAIRWISE_MAX_RUNS = 50;
export const RECURRENCE_TOP_N = 50;

export type CorpusPatternsResponse = {
  schemaVersion: 1;
  actionableCategoryHistogram: Array<{ category: string; count: number }>;
  topRunLevelCodes: Array<{ code: string; count: number }>;
  topStepReasonCodes: Array<{ code: string; count: number }>;
  recurrenceCandidates: Array<{
    signature: string;
    hitRuns: number;
    exemplars: Array<{ runId: string; seq: number; toolId: string }>;
  }>;
  pairwiseRecurrence?: RunComparisonReport["recurrence"];
};

function isFailingStep(s: StepOutcome): boolean {
  return s.status !== "verified";
}

function primaryStepReasonCode(s: StepOutcome): string | null {
  return s.reasons[0]?.code ?? null;
}

export function buildCorpusPatterns(
  outcomes: CorpusRunOutcome[],
  rows: RunListItem[],
  query: RunListQuery,
  /** For tests only; production callers omit. */
  options?: { maxMatched?: number },
):
  | { ok: true; body: CorpusPatternsResponse }
  | { ok: false; status: 413; code: string; message: string; totalMatched: number } {
  const maxMatched = options?.maxMatched ?? CORPUS_PATTERNS_MAX_MATCH;
  const matchedOk: CorpusRunLoadedOk[] = [];
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i]!;
    const row = rows[i]!;
    if (o.loadStatus !== "ok") continue;
    if (!matchesRunListQuery(row, query)) continue;
    matchedOk.push(o);
  }

  if (matchedOk.length > maxMatched) {
    return {
      ok: false,
      status: 413,
      code: "CORPUS_TOO_LARGE",
      message: `More than ${maxMatched} load-ok runs match filters; narrow filters.`,
      totalMatched: matchedOk.length,
    };
  }

  let sameWf: CorpusRunLoadedOk[] = [];
  if (query.workflowId !== undefined) {
    sameWf = matchedOk.filter((e) => e.workflowResult.workflowId === query.workflowId);
    if (sameWf.length > PATTERNS_PAIRWISE_MAX_RUNS) {
      return {
        ok: false,
        status: 413,
        code: "PATTERNS_COMPARE_TOO_MANY",
        message: `More than ${PATTERNS_PAIRWISE_MAX_RUNS} runs for workflowId filter; narrow filters.`,
        totalMatched: sameWf.length,
      };
    }
  }

  const categoryMap = new Map<string, number>();
  const runLevelMap = new Map<string, number>();
  const stepReasonMap = new Map<string, number>();
  const sigToRunIds = new Map<string, Set<string>>();
  const sigToExemplars = new Map<
    string,
    Array<{ runId: string; seq: number; toolId: string }>
  >();

  for (let i = 0; i < matchedOk.length; i++) {
    const entry = matchedOk[i]!;
    const r = entry.workflowResult;
    const actionable = perRunActionableFromWorkflowResult(r, i);
    categoryMap.set(actionable.category, (categoryMap.get(actionable.category) ?? 0) + 1);

    for (const rl of r.runLevelReasons) {
      runLevelMap.set(rl.code, (runLevelMap.get(rl.code) ?? 0) + 1);
    }

    for (const step of r.steps) {
      const pr = primaryStepReasonCode(step);
      if (pr) stepReasonMap.set(pr, (stepReasonMap.get(pr) ?? 0) + 1);
      if (!isFailingStep(step)) continue;
      const sig = recurrenceSignature(step);
      let set = sigToRunIds.get(sig);
      if (!set) {
        set = new Set();
        sigToRunIds.set(sig, set);
      }
      set.add(entry.runId);
      const ex = sigToExemplars.get(sig) ?? [];
      if (ex.length < 5) {
        ex.push({ runId: entry.runId, seq: step.seq, toolId: step.toolId });
        sigToExemplars.set(sig, ex);
      }
    }
  }

  const recurrenceCandidates = [...sigToRunIds.entries()]
    .map(([signature, runIds]) => ({
      signature,
      hitRuns: runIds.size,
      exemplars: sigToExemplars.get(signature) ?? [],
    }))
    .sort((a, b) => b.hitRuns - a.hitRuns || a.signature.localeCompare(b.signature))
    .slice(0, RECURRENCE_TOP_N);

  const actionableCategoryHistogram = [...categoryMap.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category));

  const topRunLevelCodes = [...runLevelMap.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  const topStepReasonCodes = [...stepReasonMap.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  const body: CorpusPatternsResponse = {
    schemaVersion: 1,
    actionableCategoryHistogram,
    topRunLevelCodes,
    topStepReasonCodes,
    recurrenceCandidates,
  };

  if (query.workflowId !== undefined && sameWf.length >= 2) {
    const results: WorkflowResult[] = sameWf.map((e) => e.workflowResult);
    const labels = sameWf.map((e) => e.runId);
    const report = buildRunComparisonReport(results, labels);
    body.pairwiseRecurrence = report.recurrence;
  }

  return { ok: true, body };
}
