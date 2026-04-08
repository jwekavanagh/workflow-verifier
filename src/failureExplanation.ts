import { buildFailureAnalysis } from "./failureAnalysis.js";
import { formatOperationalMessage } from "./failureCatalog.js";
import { RUN_LEVEL_CODE_TO_ORIGIN } from "./failureOriginCatalog.js";
import type {
  FailureAnalysisBase,
  FailureAnalysisEvidenceItem,
  FailureExplanationFactId,
  FailureExplanationUnknownId,
  FailureExplanationV1,
  Reason,
  StepOutcome,
  VerificationRunContext,
  WorkflowEngineResult,
  WorkflowTruthReport,
} from "./types.js";
import { userPhraseForReasonCode } from "./verificationUserPhrases.js";

export type FailureExplanationInvariantCode =
  | "EXPLANATION_VERIFICATION_POLICY_INVALID"
  | "EXPLANATION_EVIDENCE_CODES_EMPTY"
  | "EXPLANATION_PRIMARY_EVIDENCE_SCOPE_EFFECT"
  | "EXPLANATION_STEP_TRUTH_MISMATCH"
  | "EXPLANATION_RUN_CONTEXT_INDEX_MISSING";

export class FailureExplanationInvariantError extends Error {
  readonly code: FailureExplanationInvariantCode;
  constructor(code: FailureExplanationInvariantCode, message: string) {
    super(message);
    this.code = code;
    this.name = "FailureExplanationInvariantError";
  }
}

const POLICY_INVALID_MESSAGE =
  "Verification policy is missing or invalid for failure explanation." as const;

const EMPTY_CODES_MESSAGE = "Primary failure analysis evidence had empty codes." as const;
const EFFECT_SCOPE_MESSAGE = "Primary failure analysis evidence must not be scope effect." as const;
const STEP_TRUTH_MISMATCH_MESSAGE = "Truth report step missing for failure explanation driver step." as const;
const RUN_CONTEXT_INDEX_MESSAGE = "Run-context failure explanation requires ingestIndex on primary evidence." as const;

const NO_STEPS_FOR_WORKFLOW = "NO_STEPS_FOR_WORKFLOW" as const;

const MULTI_EFFECT_ROLLUP_CODES = new Set([
  "MULTI_EFFECT_PARTIAL",
  "MULTI_EFFECT_ALL_FAILED",
  "MULTI_EFFECT_INCOMPLETE",
  "MULTI_EFFECT_UNCERTAIN_WITHIN_WINDOW",
]);

type EffectRow = { id: string; status: string; reasons: Reason[] };

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
      reasons: o.reasons as Reason[],
    });
  }
  return out;
}

function sortUniqueCodes(codes: string[]): string[] {
  return [...new Set(codes)].sort((a, b) => a.localeCompare(b));
}

function minLex(codes: string[]): string {
  return sortUniqueCodes(codes)[0]!;
}

function normMessage(s: string): string {
  const t = s.replace(/\r\n|\r|\n/g, " ").replace(/ +/g, " ").trim();
  if (t.length === 0) return "(no message)";
  return formatOperationalMessage(t);
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`<${k}>`).join(v);
  }
  return out;
}

function scalarToDetail(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Exported for doc parity tests; placeholders use angle brackets in the string. */
export const FE_RUN_LEVEL_EXPECTED =
  "Verification expected a valid captured run for workflowId=<workflowId> under policy [<P>] with no run-level ingest or planning failures.";
export const FE_RUN_LEVEL_OBSERVED = "Run-level failure: code=<firstCode> detail=<detail>.";
export const FE_RUN_LEVEL_DIVERGENCE = "Divergence at run_level: code=<firstCode> meaning=<meaning>";

export const FE_EVENT_SEQUENCE_EXPECTED =
  "Verification expected monotonic, well-formed event capture for workflowId=<workflowId> under policy [<P>].";
export const FE_EVENT_SEQUENCE_OBSERVED = "Event-sequence irregularity: code=<firstCode> detail=<detail>.";
export const FE_EVENT_SEQUENCE_DIVERGENCE =
  "Divergence at event_sequence: code=<firstCode> meaning=<meaning>";

export const FE_RUN_CONTEXT_EXPECTED =
  "Verification expected upstream run context through ingest_index=<ingestIndex> to allow fair evaluation of the failing tool observation under policy [<P>].";
export const FE_RUN_CONTEXT_OBSERVED = "Run-context signal before the failing observation: code=<C> <detail>.";
export const FE_RUN_CONTEXT_DIVERGENCE =
  "Divergence at run_context before the failing tool observation: code=<C> meaning=<meaning>";

export const FE_STEP_EXPECTED =
  "Verification expected post-execution database state to satisfy verify_target \"<verifyTargetOrLiteralNull>\" and intended_effect \"<narrative>\" for seq=<seq> toolId=<toolId> under policy [<P>].";
export const FE_STEP_OBSERVED = "Step verification outcome: code=<primaryCode> detail=<detail><suffix>";
export const FE_STEP_DIVERGENCE =
  "Divergence at step seq=<seq> toolId=<toolId>: primary_code=<primaryCode> meaning=<meaning>";

export const FE_NO_STEPS_OBSERVED = "No tool_observed steps were produced for workflowId=<workflowId>.";
export const FE_NO_STEPS_DIVERGENCE =
  "Divergence: no steps to verify against the database under policy [<P>]";

/** All branch template literals (doc fences must match these). */
export const FAILURE_EXPLANATION_BRANCH_TEMPLATES = {
  runLevel: { expected: FE_RUN_LEVEL_EXPECTED, observed: FE_RUN_LEVEL_OBSERVED, divergence: FE_RUN_LEVEL_DIVERGENCE },
  eventSequence: {
    expected: FE_EVENT_SEQUENCE_EXPECTED,
    observed: FE_EVENT_SEQUENCE_OBSERVED,
    divergence: FE_EVENT_SEQUENCE_DIVERGENCE,
  },
  runContext: {
    expected: FE_RUN_CONTEXT_EXPECTED,
    observed: FE_RUN_CONTEXT_OBSERVED,
    divergence: FE_RUN_CONTEXT_DIVERGENCE,
  },
  step: { expected: FE_STEP_EXPECTED, observed: FE_STEP_OBSERVED, divergence: FE_STEP_DIVERGENCE },
  noSteps: {
    expected: FE_RUN_LEVEL_EXPECTED,
    observed: FE_NO_STEPS_OBSERVED,
    divergence: FE_NO_STEPS_DIVERGENCE,
  },
} as const;

const KNOWN_FACT_ORDER: readonly FailureExplanationFactId[] = [
  "trust_summary",
  "workflow_status",
  "verification_policy",
  "primary_origin",
  "classification_confidence",
  "failure_analysis_summary",
  "primary_scope",
  "primary_codes",
  "primary_ingest_index",
  "primary_tool_id",
  "primary_source",
  "primary_run_event_id",
  "primary_seq",
  "primary_effect_id",
  "verify_target",
  "intended_effect_narrative",
  "evidence_summary_field",
  "evidence_summary_expected",
  "evidence_summary_actual",
  "evidence_summary_row_count",
] as const;

export function policyFragment(engine: WorkflowEngineResult): string {
  const p = engine.verificationPolicy;
  if (p === undefined || p === null) {
    throw new FailureExplanationInvariantError(
      "EXPLANATION_VERIFICATION_POLICY_INVALID",
      POLICY_INVALID_MESSAGE,
    );
  }
  const { consistencyMode, verificationWindowMs, pollIntervalMs } = p;
  if (consistencyMode !== "strong" && consistencyMode !== "eventual") {
    throw new FailureExplanationInvariantError(
      "EXPLANATION_VERIFICATION_POLICY_INVALID",
      POLICY_INVALID_MESSAGE,
    );
  }
  if (typeof verificationWindowMs !== "number" || !Number.isFinite(verificationWindowMs)) {
    throw new FailureExplanationInvariantError(
      "EXPLANATION_VERIFICATION_POLICY_INVALID",
      POLICY_INVALID_MESSAGE,
    );
  }
  if (typeof pollIntervalMs !== "number" || !Number.isFinite(pollIntervalMs)) {
    throw new FailureExplanationInvariantError(
      "EXPLANATION_VERIFICATION_POLICY_INVALID",
      POLICY_INVALID_MESSAGE,
    );
  }
  return `consistencyMode=${consistencyMode}; verificationWindowMs=${verificationWindowMs}; pollIntervalMs=${pollIntervalMs}`;
}

function buildRunContextDetail(ctx: VerificationRunContext, ingestIndex: number, C: string): string {
  if (C === "RETRIEVAL_ERROR") {
    const row = ctx.retrievalEvents.find((e) => e.ingestIndex === ingestIndex && e.status === "error");
    if (row === undefined) return "run_context_record_missing=true";
    return `source=${row.source} status=error`;
  }
  if (C.startsWith("MODEL_TURN_")) {
    const suffix = C.slice("MODEL_TURN_".length).toLowerCase();
    const status = suffix as "error" | "aborted" | "incomplete";
    const row = ctx.modelTurnEvents.find((e) => e.ingestIndex === ingestIndex && e.status === status);
    if (row === undefined) return "run_context_record_missing=true";
    return `status=${row.status}`;
  }
  if (C === "CONTROL_INTERRUPT") {
    const row = ctx.controlEvents.find(
      (e) => e.ingestIndex === ingestIndex && e.controlKind === "interrupt",
    );
    if (row === undefined) return "run_context_record_missing=true";
    return "controlKind=interrupt";
  }
  if (C === "CONTROL_BRANCH_SKIPPED") {
    const row = ctx.controlEvents.find(
      (e) =>
        e.ingestIndex === ingestIndex &&
        e.controlKind === "branch" &&
        e.decision === "skipped",
    );
    if (row === undefined) return "run_context_record_missing=true";
    return "controlKind=branch decision=skipped";
  }
  if (C === "CONTROL_GATE_SKIPPED") {
    const row = ctx.controlEvents.find(
      (e) =>
        e.ingestIndex === ingestIndex && e.controlKind === "gate" && e.decision === "skipped",
    );
    if (row === undefined) return "run_context_record_missing=true";
    return "controlKind=gate decision=skipped";
  }
  if (C === "TOOL_SKIPPED") {
    const row = ctx.toolSkippedEvents.find((e) => e.ingestIndex === ingestIndex);
    if (row === undefined) return "run_context_record_missing=true";
    return `toolId=${row.toolId}`;
  }
  return "run_context_record_missing=true";
}

function msgReasonForDriverStep(driver: StepOutcome, primaryCode: string): Reason {
  const rollup = driver.reasons[0]?.code;
  if (rollup !== undefined && MULTI_EFFECT_ROLLUP_CODES.has(rollup) && primaryCode !== rollup) {
    const effects = parseEffects(driver.evidenceSummary);
    const failing = effects
      .filter((e) => e.status !== "verified")
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (failing?.reasons[0] !== undefined) return failing.reasons[0]!;
  }
  return driver.reasons[0] ?? { code: primaryCode, message: "" };
}

function evidenceSummarySuffix(evidenceSummary: Record<string, unknown>): string {
  const parts: string[] = [];
  const order = ["field", "expected", "actual", "rowCount"] as const;
  for (const k of order) {
    if (Object.prototype.hasOwnProperty.call(evidenceSummary, k)) {
      parts.push(`${k}=${scalarToDetail(evidenceSummary[k])}`);
    }
  }
  if (parts.length === 0) return "";
  return `; ${parts.join("; ")}`;
}

function buildUnknowns(fa: FailureAnalysisBase): Array<{ id: FailureExplanationUnknownId; value: string }> {
  const out: Array<{ id: FailureExplanationUnknownId; value: string }> = [];
  const unknownRows = fa.unknownReasonCodes.map((c) => ({
    id: "unknown_reason_code" as const,
    value: `code=${c}|meaning=${userPhraseForReasonCode(c)}`,
  }));
  unknownRows.sort((a, b) => a.value.localeCompare(b.value));
  out.push(...unknownRows);
  if (fa.confidence === "medium" || fa.confidence === "low") {
    out.push({ id: "classification_confidence_band", value: fa.confidence });
  }
  if (fa.alternativeHypotheses !== undefined) {
    for (const alt of fa.alternativeHypotheses) {
      out.push({
        id: "competing_hypothesis",
        value: `origin=${alt.primaryOrigin}|rationale=${normMessage(alt.rationale)}`,
      });
    }
  }
  return out;
}

function assembleKnownFacts(
  map: Map<FailureExplanationFactId, string>,
): Array<{ id: FailureExplanationFactId; value: string }> {
  const out: Array<{ id: FailureExplanationFactId; value: string }> = [];
  for (const id of KNOWN_FACT_ORDER) {
    const v = map.get(id);
    if (v !== undefined) out.push({ id, value: v });
  }
  return out;
}

function addPrimaryEvidenceFacts(
  map: Map<FailureExplanationFactId, string>,
  e0: FailureAnalysisEvidenceItem,
  fa: FailureAnalysisBase,
): void {
  map.set("primary_scope", e0.scope);
  if (e0.codes !== undefined && e0.codes.length > 0) {
    map.set("primary_codes", sortUniqueCodes(e0.codes).join(","));
  }
  if (e0.ingestIndex !== undefined) map.set("primary_ingest_index", String(e0.ingestIndex));
  if (e0.toolId !== undefined) map.set("primary_tool_id", e0.toolId);
  if (e0.source !== undefined) map.set("primary_source", e0.source);
  if (e0.runEventId !== undefined) map.set("primary_run_event_id", e0.runEventId === null ? "null" : e0.runEventId);
  if (e0.seq !== undefined) map.set("primary_seq", String(e0.seq));
  const e1 = fa.evidence[1];
  if (e1?.scope === "effect" && e1.effectId !== undefined) {
    map.set("primary_effect_id", e1.effectId);
  }
}

export function buildFailureExplanation(
  engine: WorkflowEngineResult,
  truth: Omit<WorkflowTruthReport, "failureExplanation" | "schemaVersion">,
): FailureExplanationV1 | null {
  if (engine.status === "complete") return null;

  const P = policyFragment(engine);
  const fa = buildFailureAnalysis(engine);
  if (fa === null) {
    throw new FailureExplanationInvariantError(
      "EXPLANATION_EVIDENCE_CODES_EMPTY",
      EMPTY_CODES_MESSAGE,
    );
  }

  const e0 = fa.evidence[0]!;
  if (e0.scope === "effect") {
    throw new FailureExplanationInvariantError(
      "EXPLANATION_PRIMARY_EVIDENCE_SCOPE_EFFECT",
      EFFECT_SCOPE_MESSAGE,
    );
  }
  if (!e0.codes || e0.codes.length === 0) {
    throw new FailureExplanationInvariantError("EXPLANATION_EVIDENCE_CODES_EMPTY", EMPTY_CODES_MESSAGE);
  }

  const primaryCode = minLex(e0.codes);
  const workflowId = engine.workflowId;

  const baseMap = new Map<FailureExplanationFactId, string>();
  baseMap.set("trust_summary", truth.trustSummary);
  baseMap.set("workflow_status", truth.workflowStatus);
  baseMap.set("verification_policy", P);
  baseMap.set("primary_origin", fa.primaryOrigin);
  baseMap.set("classification_confidence", fa.confidence);
  baseMap.set("failure_analysis_summary", normMessage(fa.summary));
  addPrimaryEvidenceFacts(baseMap, e0, fa);

  let expected: string;
  let observed: string;
  let divergence: string;

  if (e0.scope === "run_level") {
    const U = sortUniqueCodes(e0.codes);
    const knownOnly = U.filter((c) => c in RUN_LEVEL_CODE_TO_ORIGIN);
    const firstCode = knownOnly.length > 0 ? minLex(knownOnly) : minLex(U);
    const R = engine.runLevelReasons.find((r) => r.code === firstCode);
    const detail = normMessage(R?.message ?? "");
    const meaning = userPhraseForReasonCode(firstCode);
    expected = fillTemplate(FE_RUN_LEVEL_EXPECTED, { workflowId, P });
    observed = fillTemplate(FE_RUN_LEVEL_OBSERVED, { firstCode, detail });
    divergence = fillTemplate(FE_RUN_LEVEL_DIVERGENCE, { firstCode, meaning });
  } else if (e0.scope === "event_sequence") {
    const U = sortUniqueCodes(e0.codes);
    const firstCode = minLex(U);
    const reasons =
      engine.eventSequenceIntegrity.kind === "irregular" ? engine.eventSequenceIntegrity.reasons : [];
    const R = reasons.find((r) => r.code === firstCode);
    const detail = normMessage(R?.message ?? "");
    const meaning = userPhraseForReasonCode(firstCode);
    expected = fillTemplate(FE_EVENT_SEQUENCE_EXPECTED, { workflowId, P });
    observed = fillTemplate(FE_EVENT_SEQUENCE_OBSERVED, { firstCode, detail });
    divergence = fillTemplate(FE_EVENT_SEQUENCE_DIVERGENCE, { firstCode, meaning });
  } else if (e0.scope === "run_context") {
    if (e0.ingestIndex === undefined) {
      throw new FailureExplanationInvariantError(
        "EXPLANATION_RUN_CONTEXT_INDEX_MISSING",
        RUN_CONTEXT_INDEX_MESSAGE,
      );
    }
    const ingestIndex = String(e0.ingestIndex);
    const C = minLex(e0.codes);
    const detail = buildRunContextDetail(engine.verificationRunContext, e0.ingestIndex, C);
    const meaning = userPhraseForReasonCode(C);
    expected = fillTemplate(FE_RUN_CONTEXT_EXPECTED, { ingestIndex, P });
    observed = fillTemplate(FE_RUN_CONTEXT_OBSERVED, { C, detail });
    divergence = fillTemplate(FE_RUN_CONTEXT_DIVERGENCE, { C, meaning });
  } else if (e0.scope === "step") {
    if (primaryCode === NO_STEPS_FOR_WORKFLOW) {
      expected = fillTemplate(FE_RUN_LEVEL_EXPECTED, { workflowId, P });
      observed = fillTemplate(FE_NO_STEPS_OBSERVED, { workflowId });
      divergence = fillTemplate(FE_NO_STEPS_DIVERGENCE, { P });
    } else {
      if (e0.seq === undefined || e0.toolId === undefined) {
        throw new FailureExplanationInvariantError(
          "EXPLANATION_STEP_TRUTH_MISMATCH",
          STEP_TRUTH_MISMATCH_MESSAGE,
        );
      }
      const driver = engine.steps.find((s) => s.seq === e0.seq && s.toolId === e0.toolId);
      if (driver === undefined) {
        throw new FailureExplanationInvariantError(
          "EXPLANATION_STEP_TRUTH_MISMATCH",
          STEP_TRUTH_MISMATCH_MESSAGE,
        );
      }
      const truthStep = truth.steps.find((s) => s.seq === e0.seq && s.toolId === e0.toolId);
      if (truthStep === undefined) {
        throw new FailureExplanationInvariantError(
          "EXPLANATION_STEP_TRUTH_MISMATCH",
          STEP_TRUTH_MISMATCH_MESSAGE,
        );
      }
      const seq = String(e0.seq);
      const toolId = e0.toolId;
      const verifyTargetOrLiteralNull = truthStep.verifyTarget === null ? "null" : normMessage(truthStep.verifyTarget);
      const narrative = normMessage(truthStep.intendedEffect.narrative);
      const mr = msgReasonForDriverStep(driver, primaryCode);
      const detail = normMessage(mr.message);
      const suffix = evidenceSummarySuffix(driver.evidenceSummary);
      const meaning = userPhraseForReasonCode(primaryCode);
      expected = fillTemplate(FE_STEP_EXPECTED, {
        verifyTargetOrLiteralNull,
        narrative,
        seq,
        toolId,
        P,
      });
      observed = fillTemplate(FE_STEP_OBSERVED, { primaryCode, detail, suffix });
      divergence = fillTemplate(FE_STEP_DIVERGENCE, { seq, toolId, primaryCode, meaning });

      baseMap.set("verify_target", truthStep.verifyTarget === null ? "null" : truthStep.verifyTarget);
      baseMap.set("intended_effect_narrative", narrative);
      const es = driver.evidenceSummary;
      if (Object.prototype.hasOwnProperty.call(es, "field")) {
        baseMap.set("evidence_summary_field", scalarToDetail(es.field));
      }
      if (Object.prototype.hasOwnProperty.call(es, "expected")) {
        baseMap.set("evidence_summary_expected", scalarToDetail(es.expected));
      }
      if (Object.prototype.hasOwnProperty.call(es, "actual")) {
        baseMap.set("evidence_summary_actual", scalarToDetail(es.actual));
      }
      if (Object.prototype.hasOwnProperty.call(es, "rowCount")) {
        baseMap.set("evidence_summary_row_count", scalarToDetail(es.rowCount));
      }
    }
  } else {
    throw new Error(`Unreachable failure explanation branch: scope=${String(e0.scope)}`);
  }

  const knownFacts = assembleKnownFacts(baseMap);
  const unknowns = buildUnknowns(fa);

  return {
    schemaVersion: 1,
    expected: formatOperationalMessage(expected),
    observed: formatOperationalMessage(observed),
    divergence: formatOperationalMessage(divergence),
    knownFacts,
    unknowns,
  };
}
