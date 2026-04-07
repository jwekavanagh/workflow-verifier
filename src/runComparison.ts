import {
  buildActionableCategoryRecurrence,
  buildCategoryHistogram,
  type ActionableCategoryRecurrenceRow,
  type PerRunActionable,
} from "./actionableFailure.js";
import { compareUtf16Id } from "./resolveExpectation.js";
import type { Reason, StepOutcome, StepStatus, WorkflowResult } from "./types.js";

/** Max keys / signatures per compareHighlights list (normative cap). */
export const COMPARE_HIGHLIGHTS_MAX = 20;

export type ReliabilityTrend = "improving" | "worsening" | "unchanged" | "mixed";

export type RecurrenceBurden = {
  patternCount: number;
  maxRunsHitCount: number;
  crossRunFailure: boolean;
  rationale: string;
};

export type ReliabilityAssessment = {
  windowTrend: ReliabilityTrend;
  pairwiseTrend: ReliabilityTrend;
  recurrenceBurden: RecurrenceBurden;
  headlineVerdict: ReliabilityTrend;
  headlineRationale: string;
};

export type CompareHighlights = {
  introducedLogicalStepKeys: string[];
  resolvedLogicalStepKeys: string[];
  bothFailingChurn: Array<{
    logicalStepKey: string;
    introducedStepReasonCodes: string[];
    resolvedStepReasonCodes: string[];
  }>;
  bucketBIntroducedSignatures: Array<{ signature: string; count: number }>;
  bucketBResolvedSignatures: Array<{ signature: string; count: number }>;
  recurringSignatures: string[];
};

function severityRank(s: "high" | "medium" | "low"): number {
  if (s === "high") return 0;
  if (s === "medium") return 1;
  return 2;
}

/** Trend from first run → last run actionable posture (higher severity rank = better). */
export function actionableTrend(first: PerRunActionable, last: PerRunActionable): ReliabilityTrend {
  const fc = first.category;
  const lc = last.category;
  if (fc === "complete" && lc === "complete") return "unchanged";
  if (fc !== "complete" && lc === "complete") return "improving";
  if (fc === "complete" && lc !== "complete") return "worsening";
  if (fc !== lc) return "mixed";
  const fr = severityRank(first.severity as "high" | "medium" | "low");
  const lr = severityRank(last.severity as "high" | "medium" | "low");
  if (lr > fr) return "improving";
  if (lr < fr) return "worsening";
  return "unchanged";
}

/** Per compared run: actionable rollup (`complete` + low severity when workflow is trusted). */
export function perRunActionableFromWorkflowResult(r: WorkflowResult, runIndex: number): PerRunActionable {
  const fa = r.workflowTruthReport.failureAnalysis;
  if (fa === null) {
    return {
      runIndex,
      category: "complete",
      severity: "low",
      recommendedAction: "none",
      automationSafe: true,
    };
  }
  return {
    runIndex,
    category: fa.actionableFailure.category,
    severity: fa.actionableFailure.severity,
    recommendedAction: fa.actionableFailure.recommendedAction,
    automationSafe: fa.actionableFailure.automationSafe,
  };
}

export type BucketAEntry =
  | {
      kind: "unchangedOk";
      logicalStepKey: string;
      seqPrior: number;
      seqCurrent: number;
      toolIdPrior: string;
      toolIdCurrent: string;
    }
  | {
      kind: "introducedFailure";
      logicalStepKey: string;
      seqPrior: number;
      seqCurrent: number;
      toolIdPrior: string;
      toolIdCurrent: string;
    }
  | {
      kind: "resolvedFailure";
      logicalStepKey: string;
      seqPrior: number;
      seqCurrent: number;
      toolIdPrior: string;
      toolIdCurrent: string;
    }
  | {
      kind: "bothFailing";
      logicalStepKey: string;
      seqPrior: number;
      seqCurrent: number;
      toolIdPrior: string;
      toolIdCurrent: string;
      toolIdChanged: boolean;
      introducedStepReasonCodes: string[];
      resolvedStepReasonCodes: string[];
      effects: BucketAEffectDelta[];
    }
  | {
      kind: "structuralRemoval";
      logicalStepKey: string;
      seqPrior: number;
      toolIdPrior: string;
      priorWasFailing: boolean;
    }
  | {
      kind: "structuralAddition";
      logicalStepKey: string;
      seqCurrent: number;
      toolIdCurrent: string;
      currentIsFailing: boolean;
    };

export type BucketAEffectDelta = {
  effectId: string;
  kind: "introducedFailure" | "resolvedFailure" | "bothFailing" | "unchangedOk";
  introducedReasonCodes: string[];
  resolvedReasonCodes: string[];
  statusPrior: StepStatus | null;
  statusCurrent: StepStatus | null;
};

export type PairwiseBucketB = {
  introducedFailureSignatures: Array<{ signature: string; count: number }>;
  resolvedFailureSignatures: Array<{ signature: string; count: number }>;
  unchangedFailureInstanceCounts: Array<{ signature: string; matchedCount: number }>;
};

export type RecurrencePattern = {
  signature: string;
  runIndices: number[];
  runsHitCount: number;
  exemplars: Array<{ runIndex: number; seq: number; toolId: string }>;
};

/** JSON report shape; validate with `schemas/run-comparison-report.schema.json`. */
export type RunComparisonReport = {
  schemaVersion: 4;
  workflowId: string;
  runs: Array<{ runIndex: number; displayLabel: string }>;
  perRunActionableFailures: PerRunActionable[];
  categoryHistogram: Array<{ category: string; count: number }>;
  actionableCategoryRecurrence: ActionableCategoryRecurrenceRow[];
  pairwise: {
    priorRunIndex: number;
    currentRunIndex: number;
    runLevel: {
      introducedRunLevelCodes: string[];
      resolvedRunLevelCodes: string[];
    };
    ambiguousLogicalKeyResolutions: Array<{
      logicalStepKey: string;
      chosenSeq: number;
      droppedSeq: number;
    }>;
    bucketA: BucketAEntry[];
    bucketB: PairwiseBucketB;
  };
  recurrence: {
    patterns: RecurrencePattern[];
  };
  reliabilityAssessment: ReliabilityAssessment;
  compareHighlights: CompareHighlights;
};

function buildRecurrenceBurden(patterns: RecurrencePattern[]): RecurrenceBurden {
  const patternCount = patterns.length;
  const maxRunsHitCount =
    patternCount === 0 ? 0 : Math.max(...patterns.map((p) => p.runsHitCount));
  const crossRunFailure = patternCount > 0;
  let rationale: string;
  if (patternCount === 0) {
    rationale = "No failure signature appears in two or more distinct runs in this window.";
  } else {
    rationale = `${patternCount} failure signature(s) appear in two or more distinct runs in this window (max runs hit per signature: ${maxRunsHitCount}).`;
  }
  return { patternCount, maxRunsHitCount, crossRunFailure, rationale };
}

function buildReliabilityAssessment(
  perRun: PerRunActionable[],
  priorRunIndex: number,
  currentRunIndex: number,
  patterns: RecurrencePattern[],
): ReliabilityAssessment {
  const first = perRun[0]!;
  const last = perRun[perRun.length - 1]!;
  const windowTrend = actionableTrend(first, last);
  const priorA = perRun[priorRunIndex]!;
  const currentA = perRun[currentRunIndex]!;
  const pairwiseTrend = actionableTrend(priorA, currentA);
  const recurrenceBurden = buildRecurrenceBurden(patterns);

  let headlineVerdict: ReliabilityTrend;
  let headlineRationale: string;

  if (windowTrend === "worsening") {
    headlineVerdict = "worsening";
    headlineRationale = `First run actionable ${first.category}/${first.severity} vs last run ${last.category}/${last.severity}: overall window worsened.`;
    if (recurrenceBurden.crossRunFailure) {
      headlineRationale += ` ${recurrenceBurden.rationale}`;
    }
  } else if (windowTrend === "improving") {
    headlineVerdict = "improving";
    headlineRationale = `First run actionable ${first.category}/${first.severity} vs last run ${last.category}/${last.severity}: overall window improved.`;
    if (pairwiseTrend === "worsening") {
      headlineRationale +=
        " Latest step backslid vs prior run (pairwise trend worsening) despite window-level improvement.";
    }
  } else if (windowTrend === "mixed") {
    headlineVerdict = "mixed";
    headlineRationale = `Window trend mixed: first vs last actionable categories differ (${first.category} vs ${last.category}) without a single ordering rule.`;
  } else {
    if (pairwiseTrend !== "unchanged") {
      headlineVerdict = pairwiseTrend;
      headlineRationale = `Window actionable unchanged (${last.category}/${last.severity}); immediate prior→current hop is ${pairwiseTrend}.`;
    } else if (recurrenceBurden.crossRunFailure) {
      headlineVerdict = "mixed";
      headlineRationale = `Window and pairwise actionable unchanged, but recurring failure patterns exist. ${recurrenceBurden.rationale}`;
    } else {
      headlineVerdict = "unchanged";
      headlineRationale = `Window and pairwise actionable posture unchanged; no cross-run recurring failure signatures.`;
    }
  }

  return {
    windowTrend,
    pairwiseTrend,
    recurrenceBurden,
    headlineVerdict,
    headlineRationale,
  };
}

function capSortKeys(keys: string[]): string[] {
  return [...keys].sort(compareUtf16Id).slice(0, COMPARE_HIGHLIGHTS_MAX);
}

function buildCompareHighlights(
  bucketA: BucketAEntry[],
  bucketB: PairwiseBucketB,
  patterns: RecurrencePattern[],
): CompareHighlights {
  const introduced: string[] = [];
  const resolved: string[] = [];
  const bothChurn: CompareHighlights["bothFailingChurn"] = [];
  for (const e of bucketA) {
    if (e.kind === "introducedFailure") introduced.push(e.logicalStepKey);
    else if (e.kind === "resolvedFailure") resolved.push(e.logicalStepKey);
    else if (e.kind === "bothFailing") {
      if (e.introducedStepReasonCodes.length > 0 || e.resolvedStepReasonCodes.length > 0) {
        bothChurn.push({
          logicalStepKey: e.logicalStepKey,
          introducedStepReasonCodes: [...e.introducedStepReasonCodes],
          resolvedStepReasonCodes: [...e.resolvedStepReasonCodes],
        });
      }
    }
  }
  const recurring = capSortKeys(patterns.map((p) => p.signature));
  const bIntro = bucketB.introducedFailureSignatures
    .slice()
    .sort((a, b) => compareUtf16Id(a.signature, b.signature))
    .slice(0, COMPARE_HIGHLIGHTS_MAX);
  const bReso = bucketB.resolvedFailureSignatures
    .slice()
    .sort((a, b) => compareUtf16Id(a.signature, b.signature))
    .slice(0, COMPARE_HIGHLIGHTS_MAX);
  return {
    introducedLogicalStepKeys: capSortKeys(introduced),
    resolvedLogicalStepKeys: capSortKeys(resolved),
    bothFailingChurn: bothChurn
      .sort((a, b) => compareUtf16Id(a.logicalStepKey, b.logicalStepKey))
      .slice(0, COMPARE_HIGHLIGHTS_MAX),
    bucketBIntroducedSignatures: bIntro,
    bucketBResolvedSignatures: bReso,
    recurringSignatures: recurring,
  };
}

function isFailing(status: StepStatus): boolean {
  return status !== "verified";
}

function codesFromReasons(reasons: Reason[]): string[] {
  return reasons.map((r) => r.code);
}

/** Multiset: expand to sorted array (lexicographic on code string) for deterministic serialization. */
function sortMultisetCodes(codes: string[]): string[] {
  return [...codes].sort(compareUtf16Id);
}

function multisetFromCodes(codes: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of codes) {
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}

/** a minus b (multiset). */
function multisetSubtract(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, va] of a) {
    const vb = b.get(k) ?? 0;
    const d = va - vb;
    if (d > 0) out.set(k, d);
  }
  return out;
}

function multisetToCodes(m: Map<string, number>): string[] {
  const out: string[] = [];
  const keys = [...m.keys()].sort(compareUtf16Id);
  for (const k of keys) {
    const n = m.get(k) ?? 0;
    for (let i = 0; i < n; i++) out.push(k);
  }
  return out;
}

type EffectRow = { id: string; status: StepStatus; reasons: Reason[] };

function getEffectRows(step: StepOutcome): EffectRow[] | null {
  const raw = step.evidenceSummary?.effects;
  if (!Array.isArray(raw)) return null;
  const out: EffectRow[] = [];
  for (const e of raw) {
    if (e === null || typeof e !== "object") continue;
    const rec = e as Record<string, unknown>;
    const id = rec.id;
    const status = rec.status;
    if (typeof id !== "string" || typeof status !== "string") continue;
    const reasons = Array.isArray(rec.reasons) ? (rec.reasons as Reason[]) : [];
    out.push({ id, status: status as StepStatus, reasons });
  }
  return out.length > 0 ? out : null;
}

/** Normative: see docs — sql_row / sql_effects key. */
export function logicalStepKeyFromStep(step: StepOutcome): string | null {
  const vr = step.verificationRequest;
  if (vr === null) return null;
  if (vr.kind === "sql_row") {
    return `sql_row|${vr.table}|${vr.keyColumn}|${vr.keyValue}`;
  }
  if (vr.kind === "sql_relational") {
    const parts = [...vr.checks].sort((a, b) => compareUtf16Id(a.id, b.id));
    const segs = parts.map((c) => {
      if (c.checkKind === "related_exists") {
        const w = [...c.whereEq]
          .map((x) => `${x.column}=${x.value}`)
          .sort((a, b) => compareUtf16Id(a, b))
          .join("&");
        return `id|${c.id}|related_exists|${c.childTable}|${c.fkColumn}|${c.fkValue}|${w}|`;
      }
      if (c.checkKind === "aggregate") {
        const w = [...c.whereEq]
          .map((x) => `${x.column}=${x.value}`)
          .sort((a, b) => compareUtf16Id(a, b))
          .join("&");
        return `id|${c.id}|aggregate|${c.table}|${c.fn}|${c.sumColumn ?? ""}|${c.expectOp}|${c.expectValue}|${w}|`;
      }
      const w = [...c.whereEq]
        .map((x) => `${x.side}.${x.column}=${x.value}`)
        .sort((a, b) => compareUtf16Id(a, b))
        .join("&");
      return `id|${c.id}|join_count|${c.leftTable}|${c.rightTable}|${c.leftJoinColumn}|${c.rightJoinColumn}|${c.expectOp}|${c.expectValue}|${w}|`;
    });
    return `sql_relational|${segs.join("")}`;
  }
  const parts = [...vr.effects].sort((a, b) => compareUtf16Id(a.id, b.id));
  const segs = parts.map(
    (ef) => `id|${ef.id}|${ef.table}|${ef.keyColumn}|${ef.keyValue}|`,
  );
  return `sql_effects|${segs.join("")}`;
}

export type KeyMapResult = {
  map: Map<string, StepOutcome>;
  ambiguous: Array<{ logicalStepKey: string; chosenSeq: number; droppedSeq: number }>;
};

export function buildLogicalStepKeyMap(steps: StepOutcome[]): KeyMapResult {
  const map = new Map<string, StepOutcome>();
  const ambiguous: Array<{ logicalStepKey: string; chosenSeq: number; droppedSeq: number }> = [];
  for (const step of steps) {
    const key = logicalStepKeyFromStep(step);
    if (key === null) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, step);
      continue;
    }
    if (step.seq < existing.seq) {
      ambiguous.push({
        logicalStepKey: key,
        chosenSeq: step.seq,
        droppedSeq: existing.seq,
      });
      map.set(key, step);
    } else {
      ambiguous.push({
        logicalStepKey: key,
        chosenSeq: existing.seq,
        droppedSeq: step.seq,
      });
    }
  }
  return { map, ambiguous };
}

/** Failing-effect contributions only; UTF-16 sort by effect id. */
export function recurrenceSignature(step: StepOutcome): string {
  const stepCodes = sortMultisetCodes(codesFromReasons(step.reasons));
  let s = `${step.status}|${stepCodes.join(",")}`;
  const effects = getEffectRows(step);
  if (effects) {
    const failing = effects.filter((e) => isFailing(e.status));
    failing.sort((a, b) => compareUtf16Id(a.id, b.id));
    for (const e of failing) {
      const rc = sortMultisetCodes(codesFromReasons(e.reasons));
      s += `|e:${e.id}:${e.status}:r:${rc.join(",")}`;
    }
  }
  return s;
}

function runLevelCodeMultiset(result: WorkflowResult): Map<string, number> {
  return multisetFromCodes(result.runLevelReasons.map((r) => r.code));
}

function compareBucketAEntry(a: BucketAEntry, b: BucketAEntry): number {
  const keyA = "logicalStepKey" in a ? a.logicalStepKey : "";
  const keyB = "logicalStepKey" in b ? b.logicalStepKey : "";
  return compareUtf16Id(keyA, keyB);
}

function pairwiseBucketA(prior: WorkflowResult, current: WorkflowResult): {
  entries: BucketAEntry[];
  ambiguous: KeyMapResult["ambiguous"];
} {
  const { map: mapP, ambiguous: ambP } = buildLogicalStepKeyMap(prior.steps);
  const { map: mapC, ambiguous: ambC } = buildLogicalStepKeyMap(current.steps);
  const ambiguous = [...ambP, ...ambC].sort((x, y) => compareUtf16Id(x.logicalStepKey, y.logicalStepKey));

  const keys = new Set([...mapP.keys(), ...mapC.keys()]);
  const entries: BucketAEntry[] = [];

  for (const k of [...keys].sort(compareUtf16Id)) {
    const sp = mapP.get(k);
    const sc = mapC.get(k);

    if (sp && !sc) {
      entries.push({
        kind: "structuralRemoval",
        logicalStepKey: k,
        seqPrior: sp.seq,
        toolIdPrior: sp.toolId,
        priorWasFailing: isFailing(sp.status),
      });
      continue;
    }
    if (!sp && sc) {
      entries.push({
        kind: "structuralAddition",
        logicalStepKey: k,
        seqCurrent: sc.seq,
        toolIdCurrent: sc.toolId,
        currentIsFailing: isFailing(sc.status),
      });
      continue;
    }
    if (!sp || !sc) continue;

    const toolIdChanged = sp.toolId !== sc.toolId;
    const fp = isFailing(sp.status);
    const fc = isFailing(sc.status);

    if (!fp && !fc) {
      entries.push({
        kind: "unchangedOk",
        logicalStepKey: k,
        seqPrior: sp.seq,
        seqCurrent: sc.seq,
        toolIdPrior: sp.toolId,
        toolIdCurrent: sc.toolId,
      });
      continue;
    }
    if (!fp && fc) {
      entries.push({
        kind: "introducedFailure",
        logicalStepKey: k,
        seqPrior: sp.seq,
        seqCurrent: sc.seq,
        toolIdPrior: sp.toolId,
        toolIdCurrent: sc.toolId,
      });
      continue;
    }
    if (fp && !fc) {
      entries.push({
        kind: "resolvedFailure",
        logicalStepKey: k,
        seqPrior: sp.seq,
        seqCurrent: sc.seq,
        toolIdPrior: sp.toolId,
        toolIdCurrent: sc.toolId,
      });
      continue;
    }

    const mP = multisetFromCodes(codesFromReasons(sp.reasons));
    const mC = multisetFromCodes(codesFromReasons(sc.reasons));
    const introducedStepReasonCodes = multisetToCodes(multisetSubtract(mC, mP));
    const resolvedStepReasonCodes = multisetToCodes(multisetSubtract(mP, mC));

    const effectsP = getEffectRows(sp);
    const effectsC = getEffectRows(sc);
    const effectDeltas: BucketAEffectDelta[] = [];

    if (effectsP || effectsC) {
      const byP = new Map((effectsP ?? []).map((e) => [e.id, e]));
      const byC = new Map((effectsC ?? []).map((e) => [e.id, e]));
      const ids = new Set([...byP.keys(), ...byC.keys()]);
      for (const id of [...ids].sort(compareUtf16Id)) {
        const ep = byP.get(id);
        const ec = byC.get(id);
        if (ep && !ec) {
          effectDeltas.push({
            effectId: id,
            kind: isFailing(ep.status) ? "resolvedFailure" : "unchangedOk",
            introducedReasonCodes: [],
            resolvedReasonCodes: sortMultisetCodes(codesFromReasons(ep.reasons)),
            statusPrior: ep.status,
            statusCurrent: null,
          });
          continue;
        }
        if (!ep && ec) {
          effectDeltas.push({
            effectId: id,
            kind: isFailing(ec.status) ? "introducedFailure" : "unchangedOk",
            introducedReasonCodes: sortMultisetCodes(codesFromReasons(ec.reasons)),
            resolvedReasonCodes: [],
            statusPrior: null,
            statusCurrent: ec.status,
          });
          continue;
        }
        if (!ep || !ec) continue;
        const mp = multisetFromCodes(codesFromReasons(ep.reasons));
        const mc = multisetFromCodes(codesFromReasons(ec.reasons));
        const intro = multisetToCodes(multisetSubtract(mc, mp));
        const reso = multisetToCodes(multisetSubtract(mp, mc));
        const fpE = isFailing(ep.status);
        const fcE = isFailing(ec.status);
        let kind: BucketAEffectDelta["kind"];
        if (!fpE && !fcE) {
          kind = "unchangedOk";
        } else if (!fpE && fcE) {
          kind = "introducedFailure";
        } else if (fpE && !fcE) {
          kind = "resolvedFailure";
        } else {
          kind = "bothFailing";
        }
        effectDeltas.push({
          effectId: id,
          kind,
          introducedReasonCodes: intro,
          resolvedReasonCodes: reso,
          statusPrior: ep.status,
          statusCurrent: ec.status,
        });
      }
    }

    entries.push({
      kind: "bothFailing",
      logicalStepKey: k,
      seqPrior: sp.seq,
      seqCurrent: sc.seq,
      toolIdPrior: sp.toolId,
      toolIdCurrent: sc.toolId,
      toolIdChanged,
      introducedStepReasonCodes,
      resolvedStepReasonCodes,
      effects: effectDeltas,
    });
  }

  entries.sort(compareBucketAEntry);
  return { entries, ambiguous };
}

function pairwiseBucketB(prior: WorkflowResult, current: WorkflowResult): RunComparisonReport["pairwise"]["bucketB"] {
  const sigsP = prior.steps
    .filter((s) => s.verificationRequest === null && isFailing(s.status))
    .map((s) => recurrenceSignature(s));
  const sigsC = current.steps
    .filter((s) => s.verificationRequest === null && isFailing(s.status))
    .map((s) => recurrenceSignature(s));

  const mP = multisetFromCodes(sigsP);
  const mC = multisetFromCodes(sigsC);

  const introduced = multisetToCodes(multisetSubtract(mC, mP));
  const resolved = multisetToCodes(multisetSubtract(mP, mC));

  const introducedMap = multisetFromCodes(introduced);
  const resolvedMap = multisetFromCodes(resolved);

  const unchanged: Array<{ signature: string; matchedCount: number }> = [];
  for (const sig of [...new Set([...mP.keys(), ...mC.keys()])].sort(compareUtf16Id)) {
    const n = Math.min(mP.get(sig) ?? 0, mC.get(sig) ?? 0);
    if (n > 0) unchanged.push({ signature: sig, matchedCount: n });
  }

  return {
    introducedFailureSignatures: multisetToPairArray(introducedMap),
    resolvedFailureSignatures: multisetToPairArray(resolvedMap),
    unchangedFailureInstanceCounts: unchanged,
  };
}

function multisetToPairArray(m: Map<string, number>): Array<{ signature: string; count: number }> {
  return [...m.entries()]
    .sort((a, b) => compareUtf16Id(a[0], b[0]))
    .map(([signature, count]) => ({ signature, count }));
}

function buildRecurrence(results: WorkflowResult[]): RunComparisonReport["recurrence"] {
  const signatureToRuns = new Map<string, Set<number>>();
  const signatureToExemplars = new Map<string, Array<{ runIndex: number; seq: number; toolId: string }>>();

  for (let ri = 0; ri < results.length; ri++) {
    const seen = new Set<string>();
    for (const step of results[ri]!.steps) {
      if (!isFailing(step.status)) continue;
      const sig = recurrenceSignature(step);
      if (seen.has(sig)) continue;
      seen.add(sig);
      let set = signatureToRuns.get(sig);
      if (!set) {
        set = new Set();
        signatureToRuns.set(sig, set);
      }
      set.add(ri);
      let ex = signatureToExemplars.get(sig);
      if (!ex) {
        ex = [];
        signatureToExemplars.set(sig, ex);
      }
      if (ex.length < 3) {
        ex.push({ runIndex: ri, seq: step.seq, toolId: step.toolId });
      }
    }
  }

  const patterns: RunComparisonReport["recurrence"]["patterns"] = [];
  for (const sig of [...signatureToRuns.keys()].sort(compareUtf16Id)) {
    const runs = signatureToRuns.get(sig)!;
    if (runs.size < 2) continue;
    const runIndices = [...runs].sort((a, b) => a - b);
    patterns.push({
      signature: sig,
      runIndices,
      runsHitCount: runs.size,
      exemplars: signatureToExemplars.get(sig) ?? [],
    });
  }

  return { patterns };
}

export function buildRunComparisonReport(
  results: WorkflowResult[],
  displayLabels: string[],
): RunComparisonReport {
  if (results.length !== displayLabels.length) {
    throw new Error("buildRunComparisonReport: results and displayLabels length mismatch");
  }
  if (results.length < 2) {
    throw new Error("buildRunComparisonReport: at least two runs required");
  }
  const wf = results[0]!.workflowId;
  for (const r of results) {
    if (r.workflowId !== wf) {
      throw new Error("buildRunComparisonReport: workflowId mismatch");
    }
  }

  const n = results.length;
  const prior = results[n - 2]!;
  const current = results[n - 1]!;
  const mP = runLevelCodeMultiset(prior);
  const mC = runLevelCodeMultiset(current);

  const { entries: bucketA, ambiguous } = pairwiseBucketA(prior, current);
  const bucketB = pairwiseBucketB(prior, current);

  const perRunActionableFailures = results.map((r, i) => perRunActionableFromWorkflowResult(r, i));
  const categoryHistogram = buildCategoryHistogram(perRunActionableFailures);
  const actionableCategoryRecurrence = buildActionableCategoryRecurrence(perRunActionableFailures);
  const recurrence = buildRecurrence(results);
  const reliabilityAssessment = buildReliabilityAssessment(
    perRunActionableFailures,
    n - 2,
    n - 1,
    recurrence.patterns,
  );
  const compareHighlights = buildCompareHighlights(bucketA, bucketB, recurrence.patterns);

  return {
    schemaVersion: 4,
    workflowId: wf,
    runs: results.map((_, i) => ({
      runIndex: i,
      displayLabel: displayLabels[i]!,
    })),
    perRunActionableFailures,
    categoryHistogram,
    actionableCategoryRecurrence,
    pairwise: {
      priorRunIndex: n - 2,
      currentRunIndex: n - 1,
      runLevel: {
        introducedRunLevelCodes: multisetToCodes(multisetSubtract(mC, mP)),
        resolvedRunLevelCodes: multisetToCodes(multisetSubtract(mP, mC)),
      },
      ambiguousLogicalKeyResolutions: ambiguous.map((a) => ({
        logicalStepKey: a.logicalStepKey,
        chosenSeq: a.chosenSeq,
        droppedSeq: a.droppedSeq,
      })),
      bucketA,
      bucketB,
    },
    recurrence,
    reliabilityAssessment,
    compareHighlights,
  };
}

export function formatRunComparisonReport(report: RunComparisonReport): string {
  const lines: string[] = [];
  lines.push(`cross_run_comparison:`);
  lines.push(`  workflow_id: ${report.workflowId}`);
  lines.push(`  runs: ${report.runs.map((r) => `${r.runIndex}=${r.displayLabel}`).join(", ")}`);
  lines.push(
    `  per_run_actionable: ${report.perRunActionableFailures.map((p) => `${p.runIndex}=${p.category}/${p.severity}/${p.recommendedAction}/${p.automationSafe}`).join(", ")}`,
  );
  lines.push(
    `  category_histogram: ${report.categoryHistogram.map((h) => `${h.category}×${h.count}`).join("; ") || "(none)"}`,
  );
  lines.push(`  actionable_category_recurrence:`);
  for (const row of report.actionableCategoryRecurrence) {
    lines.push(
      `    - ${row.category} indices=${row.runIndicesAscending.join(",")} hits=${row.runsHitCount} max_streak=${row.maxConsecutiveRunStreak}`,
    );
  }
  lines.push(`  pairwise: prior_run_index=${report.pairwise.priorRunIndex} current_run_index=${report.pairwise.currentRunIndex}`);
  const rl = report.pairwise.runLevel;
  lines.push(`  run_level_introduced: ${rl.introducedRunLevelCodes.length ? rl.introducedRunLevelCodes.join(", ") : "(none)"}`);
  lines.push(`  run_level_resolved: ${rl.resolvedRunLevelCodes.length ? rl.resolvedRunLevelCodes.join(", ") : "(none)"}`);

  if (report.pairwise.ambiguousLogicalKeyResolutions.length) {
    lines.push(`  ambiguous_logical_keys:`);
    for (const a of report.pairwise.ambiguousLogicalKeyResolutions) {
      lines.push(`    - key=${a.logicalStepKey} kept_seq=${a.chosenSeq} dropped_seq=${a.droppedSeq}`);
    }
  }

  lines.push(`  bucket_a:`);
  for (const e of report.pairwise.bucketA) {
    if (e.kind === "unchangedOk") {
      lines.push(
        `    - unchanged_ok key=${e.logicalStepKey} seq_prior=${e.seqPrior} seq_current=${e.seqCurrent} tool_prior=${e.toolIdPrior} tool_current=${e.toolIdCurrent}`,
      );
    } else if (e.kind === "introducedFailure") {
      lines.push(
        `    - introduced_failure key=${e.logicalStepKey} seq_current=${e.seqCurrent} tool_current=${e.toolIdCurrent}`,
      );
    } else if (e.kind === "resolvedFailure") {
      lines.push(
        `    - resolved_failure key=${e.logicalStepKey} seq_prior=${e.seqPrior} tool_prior=${e.toolIdPrior}`,
      );
    } else if (e.kind === "structuralRemoval") {
      lines.push(
        `    - structural_removal key=${e.logicalStepKey} seq_prior=${e.seqPrior} prior_was_failing=${e.priorWasFailing}`,
      );
    } else if (e.kind === "structuralAddition") {
      lines.push(
        `    - structural_addition key=${e.logicalStepKey} seq_current=${e.seqCurrent} current_is_failing=${e.currentIsFailing}`,
      );
    } else if (e.kind === "bothFailing") {
      lines.push(
        `    - both_failing key=${e.logicalStepKey} seq_prior=${e.seqPrior} seq_current=${e.seqCurrent} tool_id_changed=${e.toolIdChanged} introduced_reasons=${e.introducedStepReasonCodes.join(",") || "(none)"} resolved_reasons=${e.resolvedStepReasonCodes.join(",") || "(none)"}`,
      );
      for (const ef of e.effects) {
        lines.push(
          `        effect ${ef.effectId}: ${ef.kind} intro=${ef.introducedReasonCodes.join(",") || "(none)"} resolved=${ef.resolvedReasonCodes.join(",") || "(none)"}`,
        );
      }
    }
  }

  const b = report.pairwise.bucketB;
  lines.push(`  bucket_b_null_request:`);
  lines.push(
    `    introduced_signatures: ${b.introducedFailureSignatures.map((x) => `${x.signature}×${x.count}`).join("; ") || "(none)"}`,
  );
  lines.push(
    `    resolved_signatures: ${b.resolvedFailureSignatures.map((x) => `${x.signature}×${x.count}`).join("; ") || "(none)"}`,
  );
  lines.push(
    `    unchanged_instance_counts: ${b.unchangedFailureInstanceCounts.map((x) => `${x.signature}×${x.matchedCount}`).join("; ") || "(none)"}`,
  );

  lines.push(`  recurrence_patterns:`);
  if (report.recurrence.patterns.length === 0) {
    lines.push(`    (none)`);
  } else {
    for (const p of report.recurrence.patterns) {
      lines.push(`    - runs=${p.runIndices.join(",")} hit_count=${p.runsHitCount}`);
      lines.push(`      signature: ${p.signature}`);
      for (const ex of p.exemplars) {
        lines.push(`      exemplar: run=${ex.runIndex} seq=${ex.seq} tool=${ex.toolId}`);
      }
    }
  }

  const ra = report.reliabilityAssessment;
  lines.push(`  reliability_assessment:`);
  lines.push(`    window_trend: ${ra.windowTrend}`);
  lines.push(`    pairwise_trend: ${ra.pairwiseTrend}`);
  lines.push(`    recurrence_pattern_count: ${ra.recurrenceBurden.patternCount}`);
  lines.push(`    recurrence_max_runs_hit: ${ra.recurrenceBurden.maxRunsHitCount}`);
  lines.push(`    recurrence_cross_run_failure: ${ra.recurrenceBurden.crossRunFailure}`);
  lines.push(`    recurrence_rationale: ${ra.recurrenceBurden.rationale}`);
  lines.push(`    headline_verdict: ${ra.headlineVerdict}`);
  lines.push(`    headline_rationale: ${ra.headlineRationale}`);

  const ch = report.compareHighlights;
  lines.push(`  compare_highlights:`);
  lines.push(`    introduced_keys: ${ch.introducedLogicalStepKeys.join("; ") || "(none)"}`);
  lines.push(`    resolved_keys: ${ch.resolvedLogicalStepKeys.join("; ") || "(none)"}`);
  lines.push(`    both_failing_churn_count: ${ch.bothFailingChurn.length}`);
  lines.push(`    bucket_b_introduced: ${ch.bucketBIntroducedSignatures.map((x) => `${x.signature}×${x.count}`).join("; ") || "(none)"}`);
  lines.push(`    bucket_b_resolved: ${ch.bucketBResolvedSignatures.map((x) => `${x.signature}×${x.count}`).join("; ") || "(none)"}`);
  lines.push(`    recurring_signatures: ${ch.recurringSignatures.join("; ") || "(none)"}`);

  return lines.join("\n");
}
