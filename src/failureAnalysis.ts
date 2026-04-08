import {
  EVENT_SEQUENCE_CODE_TO_ORIGIN,
  REASON_CODE_TO_ORIGIN,
  RUN_LEVEL_CODE_TO_ORIGIN,
  STEP_NO_REASON_CODE,
} from "./failureOriginCatalog.js";
import type { FailureOrigin } from "./failureOriginTypes.js";
import { createEmptyVerificationRunContext } from "./verificationRunContext.js";
import type {
  FailureAnalysisBase,
  FailureAnalysisAlternative,
  FailureAnalysisEvidenceItem,
  StepOutcome,
  StepStatus,
  VerificationRunContext,
  WorkflowEngineResult,
} from "./types.js";

function sortUniqueCodes(codes: string[]): string[] {
  return [...new Set(codes)].sort((a, b) => a.localeCompare(b));
}

const RATIONALE_ROW_ABSENT_DOWNSTREAM =
  "The database has no row at the verified key; the tool log may not have committed a write, or replication lag prevented observation.";
const RATIONALE_ROW_ABSENT_TOOL_USE =
  "The database has no row at the verified key; the registry key/value or pointer resolution from tool params may not match the row that was written.";
const RATIONALE_VALUE_MISMATCH_DOWNSTREAM =
  "Stored column values differ from required fields; the live database state may have diverged from what the tool reported.";
const RATIONALE_VALUE_MISMATCH_INPUTS =
  "Stored column values differ from required fields; registry pointers or consts used to build the verification request may not match the observation payload.";
const RATIONALE_BRANCH_SKIPPED_ALT =
  "A branch or gate was skipped earlier in capture order; sequencing or capture may also explain the later verification outcome.";

const MULTI_EFFECT_ROLLUP_CODES = new Set([
  "MULTI_EFFECT_PARTIAL",
  "MULTI_EFFECT_ALL_FAILED",
  "MULTI_EFFECT_INCOMPLETE",
  "MULTI_EFFECT_UNCERTAIN_WITHIN_WINDOW",
]);

const STATUS_RANK: Record<StepStatus, number> = {
  incomplete_verification: 0,
  missing: 1,
  inconsistent: 2,
  partially_verified: 3,
  uncertain: 4,
  verified: 99,
};

function minLex(codes: string[]): string {
  return [...new Set(codes)].sort((a, b) => a.localeCompare(b))[0]!;
}

function failingSeqSet(steps: StepOutcome[]): Set<number> {
  const F = new Set<number>();
  for (const s of steps) {
    if (s.status !== "verified") F.add(s.seq);
  }
  return F;
}

function iFailForF(F: Set<number>, ctx: VerificationRunContext): number | null {
  const indices: number[] = [];
  for (const seq of F) {
    const idx = ctx.toolObservedIngestIndexBySeq[String(seq)];
    if (idx !== undefined) indices.push(idx);
  }
  if (indices.length === 0) return null;
  return Math.min(...indices);
}

type EffectRow = { id: string; status: string; reasons: { code: string; message: string }[] };

function parseEffects(evidenceSummary: Record<string, unknown>): EffectRow[] {
  const raw = evidenceSummary.effects;
  if (!Array.isArray(raw)) return [];
  const out: EffectRow[] = [];
  for (const row of raw) {
    if (typeof row !== "object" || row === null) continue;
    const o = row as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.status !== "string" || !Array.isArray(o.reasons)) continue;
    out.push({
      id: o.id,
      status: o.status,
      reasons: o.reasons as { code: string; message: string }[],
    });
  }
  return out;
}

function primaryCodeForStep(step: StepOutcome): string {
  const rollup = step.reasons[0]?.code;
  if (rollup !== undefined && MULTI_EFFECT_ROLLUP_CODES.has(rollup)) {
    const effects = parseEffects(step.evidenceSummary);
    const failing = effects
      .filter((e) => e.status !== "verified")
      .sort((a, b) => a.id.localeCompare(b.id));
    const first = failing[0];
    if (first !== undefined && first.reasons[0] !== undefined) {
      return first.reasons[0]!.code;
    }
  }
  if (step.reasons.length > 0) return step.reasons[0]!.code;
  return STEP_NO_REASON_CODE;
}

/** Same ordering as P5 driver step selection; exported for `failureExplanation` (no duplicate logic). */
export function normativeDriverStep(steps: StepOutcome[]): StepOutcome {
  const bad = steps.filter((s) => s.status !== "verified");
  bad.sort((a, b) => {
    const ra = STATUS_RANK[a.status];
    const rb = STATUS_RANK[b.status];
    if (ra !== rb) return ra - rb;
    if (a.seq !== b.seq) return a.seq - b.seq;
    return a.toolId.localeCompare(b.toolId);
  });
  return bad[0]!;
}

function pickDriverStep(steps: StepOutcome[]): StepOutcome {
  return normativeDriverStep(steps);
}

function alternativesForCode(primaryCode: string): FailureAnalysisAlternative[] | undefined {
  if (primaryCode === "ROW_ABSENT") {
    return [
      { primaryOrigin: "downstream_system_state", rationale: RATIONALE_ROW_ABSENT_DOWNSTREAM },
      { primaryOrigin: "tool_use", rationale: RATIONALE_ROW_ABSENT_TOOL_USE },
    ];
  }
  if (primaryCode === "VALUE_MISMATCH") {
    return [
      { primaryOrigin: "downstream_system_state", rationale: RATIONALE_VALUE_MISMATCH_DOWNSTREAM },
      { primaryOrigin: "inputs", rationale: RATIONALE_VALUE_MISMATCH_INPUTS },
    ];
  }
  return undefined;
}

function buildSummary(
  origin: FailureOrigin,
  phase: "p0" | "p1" | "p2" | "p2b" | "p3" | "p4" | "p5",
  detail: {
    codes?: string[];
    driverStep?: StepOutcome;
    primaryCode?: string;
    eventCode?: string;
    retrievalLabel?: string;
  },
): string {
  switch (phase) {
    case "p0":
      return `Run-level ingest or planning issue (${detail.codes?.join(", ") ?? ""}); origin: ${origin}.`;
    case "p1":
      return `A retrieval step failed before the failing tool observation (${detail.retrievalLabel ?? "retrieval error"}); origin: retrieval.`;
    case "p2":
      return `A model or control event indicates the run did not complete normally before the failing tool observation; origin: ${origin}.`;
    case "p2b":
      return `A branch or gate was skipped before the failing tool observation; decision-making may explain downstream behavior (see alternatives).`;
    case "p3":
      return `A tool was skipped before the failing tool observation; origin: tool_use.`;
    case "p4":
      return `Event capture order or timestamps were irregular (${detail.eventCode ?? ""}); origin: workflow_flow.`;
    case "p5": {
      const st = detail.driverStep;
      const pc = detail.primaryCode ?? "";
      let s = `Primary failure at seq ${st?.seq ?? "?"} tool ${st?.toolId ?? "?"} (code ${pc}); origin: ${origin}.`;
      const rollup = st?.reasons[0]?.code;
      if (rollup !== undefined && MULTI_EFFECT_ROLLUP_CODES.has(rollup)) {
        s +=
          " Multi-effect verification: authoritative per-effect outcomes are under workflowTruthReport.steps[].effects.";
      }
      return s;
    }
    default:
      return `Verification did not complete; origin: ${origin}.`;
  }
}

/**
 * Normative failure analysis (P0–P5) per product spec. `engine` must include `verificationRunContext`.
 */
export function buildFailureAnalysis(engine: WorkflowEngineResult): FailureAnalysisBase | null {
  if (engine.status === "complete") return null;

  const ctx = engine.verificationRunContext ?? createEmptyVerificationRunContext();
  const F = failingSeqSet(engine.steps);
  const iFail = F.size > 0 ? iFailForF(F, ctx) : null;

  // P0
  if (engine.runLevelReasons.length > 0) {
    const codes = engine.runLevelReasons.map((r) => r.code);
    const unique = sortUniqueCodes(codes);
    const unknownReasonCodes = sortUniqueCodes(unique.filter((c) => !(c in RUN_LEVEL_CODE_TO_ORIGIN)));
    const knownOnly = unique.filter((c) => c in RUN_LEVEL_CODE_TO_ORIGIN);
    const first = knownOnly.length > 0 ? minLex(knownOnly) : minLex(unique);
    const origin: FailureOrigin =
      knownOnly.length > 0 ? RUN_LEVEL_CODE_TO_ORIGIN[first as keyof typeof RUN_LEVEL_CODE_TO_ORIGIN]! : "workflow_flow";
    let confidence: FailureAnalysisBase["confidence"];
    if (unknownReasonCodes.length > 0) {
      confidence = "low";
    } else if (new Set(codes).size === 1) {
      confidence = "high";
    } else {
      confidence = "medium";
    }
    const evidence: FailureAnalysisEvidenceItem[] = [{ scope: "run_level", codes: unique }];
    return {
      summary: buildSummary(origin, "p0", { codes: unique }),
      primaryOrigin: origin,
      confidence,
      unknownReasonCodes,
      evidence,
    };
  }

  // P1–P3 need iFail
  if (iFail !== null) {
    const errRetrievals = ctx.retrievalEvents.filter((e) => e.status === "error" && e.ingestIndex < iFail);
    if (errRetrievals.length > 0) {
      const e0 = errRetrievals[0]!;
      const evidence: FailureAnalysisEvidenceItem[] = errRetrievals.map((e) => ({
        scope: "run_context" as const,
        ingestIndex: e.ingestIndex,
        source: e.source,
        runEventId: e.runEventId,
        codes: ["RETRIEVAL_ERROR"],
      }));
      return {
        summary: buildSummary("retrieval", "p1", { retrievalLabel: e0.source }),
        primaryOrigin: "retrieval",
        confidence: "high",
        unknownReasonCodes: [],
        evidence,
      };
    }

    const badModel = ctx.modelTurnEvents.find(
      (e) => ["error", "aborted", "incomplete"].includes(e.status) && e.ingestIndex < iFail,
    );
    if (badModel !== undefined) {
      return {
        summary: buildSummary("decision_making", "p2", {}),
        primaryOrigin: "decision_making",
        confidence: "high",
        unknownReasonCodes: [],
        evidence: [
          {
            scope: "run_context",
            ingestIndex: badModel.ingestIndex,
            runEventId: badModel.runEventId,
            codes: [`MODEL_TURN_${badModel.status.toUpperCase()}`],
          },
        ],
      };
    }

    const interrupt = ctx.controlEvents.find((e) => e.controlKind === "interrupt" && e.ingestIndex < iFail);
    if (interrupt !== undefined) {
      return {
        summary: buildSummary("decision_making", "p2", {}),
        primaryOrigin: "decision_making",
        confidence: "high",
        unknownReasonCodes: [],
        evidence: [
          {
            scope: "run_context",
            ingestIndex: interrupt.ingestIndex,
            runEventId: interrupt.runEventId,
            codes: ["CONTROL_INTERRUPT"],
          },
        ],
      };
    }

    const skippedBg = ctx.controlEvents.find(
      (e) =>
        (e.controlKind === "branch" || e.controlKind === "gate") &&
        e.decision === "skipped" &&
        e.ingestIndex < iFail,
    );
    if (skippedBg !== undefined) {
      return {
        summary: buildSummary("decision_making", "p2b", {}),
        primaryOrigin: "decision_making",
        confidence: "medium",
        unknownReasonCodes: [],
        evidence: [
          {
            scope: "run_context",
            ingestIndex: skippedBg.ingestIndex,
            runEventId: skippedBg.runEventId,
            codes: [`CONTROL_${skippedBg.controlKind.toUpperCase()}_SKIPPED`],
          },
        ],
        alternativeHypotheses: [{ primaryOrigin: "workflow_flow", rationale: RATIONALE_BRANCH_SKIPPED_ALT }],
      };
    }

    const skippedTool = ctx.toolSkippedEvents.find((e) => e.ingestIndex < iFail);
    if (skippedTool !== undefined) {
      return {
        summary: buildSummary("tool_use", "p3", {}),
        primaryOrigin: "tool_use",
        confidence: "medium",
        unknownReasonCodes: [],
        evidence: [
          {
            scope: "run_context",
            ingestIndex: skippedTool.ingestIndex,
            toolId: skippedTool.toolId,
            codes: ["TOOL_SKIPPED"],
          },
        ],
      };
    }
  }

  // P4
  if (engine.eventSequenceIntegrity.kind === "irregular") {
    const reasons = engine.eventSequenceIntegrity.reasons;
    const esCodes = sortUniqueCodes(reasons.map((r) => r.code));
    const unknownReasonCodes = sortUniqueCodes(esCodes.filter((c) => !(c in EVENT_SEQUENCE_CODE_TO_ORIGIN)));
    const knownEs = esCodes.filter((c) => c in EVENT_SEQUENCE_CODE_TO_ORIGIN);
    const firstCode = knownEs.length > 0 ? minLex(knownEs) : minLex(esCodes);
    const origin: FailureOrigin =
      knownEs.length > 0
        ? EVENT_SEQUENCE_CODE_TO_ORIGIN[firstCode as keyof typeof EVENT_SEQUENCE_CODE_TO_ORIGIN]!
        : "workflow_flow";
    const confidence: FailureAnalysisBase["confidence"] =
      unknownReasonCodes.length > 0 ? "low" : "high";
    return {
      summary: buildSummary(origin, "p4", { eventCode: firstCode }),
      primaryOrigin: origin,
      confidence,
      unknownReasonCodes,
      evidence: [{ scope: "event_sequence", codes: esCodes }],
    };
  }

  // P5
  if (engine.steps.length === 0) {
    return {
      summary: "No verification steps were produced; origin: workflow_flow.",
      primaryOrigin: "workflow_flow",
      confidence: "high",
      unknownReasonCodes: [],
      evidence: [{ scope: "step", codes: ["NO_STEPS_FOR_WORKFLOW"] }],
    };
  }

  const driverStep = pickDriverStep(engine.steps);
  const primaryCode = primaryCodeForStep(driverStep);
  const mappedOrigin = REASON_CODE_TO_ORIGIN[primaryCode];
  const origin: FailureOrigin = mappedOrigin ?? "workflow_flow";
  const alts = alternativesForCode(primaryCode);
  const unknownReasonCodes =
    primaryCode in REASON_CODE_TO_ORIGIN ? [] : sortUniqueCodes([primaryCode]);
  const confidence: FailureAnalysisBase["confidence"] =
    primaryCode === STEP_NO_REASON_CODE || mappedOrigin === undefined
      ? "low"
      : alts !== undefined
        ? "medium"
        : "high";

  const evidence: FailureAnalysisEvidenceItem[] = [
    {
      scope: "step",
      seq: driverStep.seq,
      toolId: driverStep.toolId,
      codes: [primaryCode],
    },
  ];

  if (MULTI_EFFECT_ROLLUP_CODES.has(driverStep.reasons[0]?.code ?? "") && primaryCode !== driverStep.reasons[0]?.code) {
    const effects = parseEffects(driverStep.evidenceSummary);
    const failing = effects
      .filter((e) => e.status !== "verified")
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (failing !== undefined) {
      evidence.push({ scope: "effect", effectId: failing.id, seq: driverStep.seq, codes: [primaryCode] });
    }
  }

  return {
    summary: buildSummary(origin, "p5", { driverStep, primaryCode }),
    primaryOrigin: origin,
    confidence,
    unknownReasonCodes,
    evidence,
    ...(alts !== undefined ? { alternativeHypotheses: alts } : {}),
  };
}
