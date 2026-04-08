import { readFileSync } from "fs";
import { compareUtf16Id } from "./resolveExpectation.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import { TruthLayerError } from "./truthLayerError.js";
import type { WorkflowResult } from "./types.js";
import type { QuickVerifyReport } from "./quickVerify/runQuickVerify.js";
import { stableStringify } from "./jsonStableStringify.js";

export { stableStringify } from "./jsonStableStringify.js";
import { CLI_OPERATIONAL_CODES } from "./cliOperationalCodes.js";

export type CiLockBatchV1 = {
  lockSchemaVersion: 1;
  kind: "batch";
  workflowId: string;
  status: WorkflowResult["status"];
  verificationPolicy: WorkflowResult["verificationPolicy"];
  runLevelReasonCodes: string[];
  eventSequence: { kind: "normal" } | { kind: "irregular"; reasonCodes: string[] };
  steps: Array<{
    seq: number;
    toolId: string;
    status: string;
    outcomeLabel: string;
    reasonCodes: string[];
    referenceCode: string | null;
  }>;
  primaryFailureCodes: string[];
  correctnessEnforcementKind: string | null;
  enforceableProjection: Record<string, unknown> | null;
};

export type CiLockQuickV1 = {
  lockSchemaVersion: 1;
  kind: "quick";
  verdict: QuickVerifyReport["verdict"];
  ingestReasonCodes: string[];
  runHeaderReasonCodes: string[];
  units: Array<{
    unitId: string;
    kind: "row" | "related_exists";
    verdict: "verified" | "fail" | "uncertain";
    reasonCodes: string[];
    toolName: string;
    actionIndex: number;
  }>;
};

export type CiLockV1 = CiLockBatchV1 | CiLockQuickV1;

function sortedUniqueStrings(arr: string[]): string[] {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b));
}

export function workflowResultToCiLockV1(result: WorkflowResult): CiLockBatchV1 {
  const runLevelReasonCodes = sortedUniqueStrings(result.runLevelReasons.map((r) => r.code));
  const es = result.eventSequenceIntegrity;
  const eventSequence: CiLockBatchV1["eventSequence"] =
    es.kind === "normal"
      ? { kind: "normal" }
      : { kind: "irregular", reasonCodes: sortedUniqueStrings(es.reasons.map((r) => r.code)) };

  const truthSteps = result.workflowTruthReport.steps;
  const stepsLock = result.steps.map((s) => {
    const ts =
      truthSteps.find((t) => t.seq === s.seq && t.toolId === s.toolId) ??
      truthSteps.find((t) => t.seq === s.seq);
    const outcomeLabel = ts?.outcomeLabel ?? "VERIFIED";
    return {
      seq: s.seq,
      toolId: s.toolId,
      status: s.status,
      outcomeLabel,
      reasonCodes: sortedUniqueStrings(s.reasons.map((r) => r.code)),
      referenceCode: s.reasons[0]?.code ?? null,
    };
  });

  const fa = result.workflowTruthReport.failureAnalysis;
  const primaryFailureCodes = fa
    ? sortedUniqueStrings([...fa.evidence.flatMap((e) => e.codes ?? []), ...fa.unknownReasonCodes])
    : [];

  const cd = result.workflowTruthReport.correctnessDefinition;
  const enforceableProjection = cd?.enforceableProjection;
  return {
    lockSchemaVersion: 1,
    kind: "batch",
    workflowId: result.workflowId,
    status: result.status,
    verificationPolicy: result.verificationPolicy,
    runLevelReasonCodes,
    eventSequence,
    steps: stepsLock,
    primaryFailureCodes,
    correctnessEnforcementKind: cd?.enforcementKind ?? null,
    enforceableProjection:
      enforceableProjection !== undefined && enforceableProjection !== null
        ? (JSON.parse(JSON.stringify(enforceableProjection)) as Record<string, unknown>)
        : null,
  };
}

export function quickReportToCiLockV1(report: QuickVerifyReport): CiLockQuickV1 {
  const units = [...report.units]
    .sort((a, b) => compareUtf16Id(a.unitId, b.unitId))
    .map((u) => ({
      unitId: u.unitId,
      kind: u.kind,
      verdict: u.verdict,
      reasonCodes: sortedUniqueStrings(u.reasonCodes),
      toolName: u.sourceAction.toolName,
      actionIndex: u.sourceAction.actionIndex,
    }));
  return {
    lockSchemaVersion: 1,
    kind: "quick",
    verdict: report.verdict,
    ingestReasonCodes: sortedUniqueStrings(report.ingest.reasonCodes),
    runHeaderReasonCodes: report.runHeaderReasonCodes
      ? sortedUniqueStrings(report.runHeaderReasonCodes)
      : [],
    units,
  };
}

export function toCiLockV1(emitted: WorkflowResult): CiLockBatchV1;
export function toCiLockV1(emitted: QuickVerifyReport): CiLockQuickV1;
export function toCiLockV1(emitted: WorkflowResult | QuickVerifyReport): CiLockV1 {
  if ("workflowTruthReport" in emitted && emitted.schemaVersion === 15) {
    return workflowResultToCiLockV1(emitted);
  }
  if ("verdict" in emitted && emitted.schemaVersion === 3) {
    return quickReportToCiLockV1(emitted as QuickVerifyReport);
  }
  throw new Error("toCiLockV1: unsupported emitted type");
}

export function assertCiLockSchemaValid(lock: unknown): asserts lock is CiLockV1 {
  const v = loadSchemaValidator("ci-lock-v1");
  if (!v(lock)) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.CI_LOCK_SCHEMA_INVALID,
      JSON.stringify(v.errors ?? []),
    );
  }
}

export function parseCiLockFromUtf8File(path: string): CiLockV1 {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new TruthLayerError(CLI_OPERATIONAL_CODES.CI_LOCK_SCHEMA_INVALID, formatOperationalMessageForLock(msg));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new TruthLayerError(CLI_OPERATIONAL_CODES.CI_LOCK_SCHEMA_INVALID, formatOperationalMessageForLock(msg));
  }
  assertCiLockSchemaValid(parsed);
  return parsed;
}

function formatOperationalMessageForLock(msg: string): string {
  const m = msg.trim();
  return m.length <= 2000 ? m : `${m.slice(0, 1997)}...`;
}

export function ciLocksEqualStable(a: CiLockV1, b: CiLockV1): boolean {
  return stableStringify(a) === stableStringify(b);
}
