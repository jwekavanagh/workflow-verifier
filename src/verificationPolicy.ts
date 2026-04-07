import type { DatabaseSync } from "node:sqlite";
import { CLI_OPERATIONAL_CODES } from "./failureCatalog.js";
import {
  rollupMultiEffectsFromReconciledRows,
  rollupMultiEffectsSync,
  rollupSqlRelationalAsync,
  rollupSqlRelationalFromReconciled,
  rollupSqlRelationalSync,
} from "./multiEffectRollup.js";
import type { ResolveResult } from "./resolveExpectation.js";
import { compareUtf16Id } from "./resolveExpectation.js";
import { reconcileRelationalSqlite } from "./relationalInvariant.js";
import {
  reconcileSqlRow,
  reconcileSqlRowAbsent,
  type ReconcileOutput,
} from "./reconciler.js";
import type {
  Reason,
  ResolvedEffect,
  ResolvedRelationalCheck,
  RowAbsentVerificationRequest,
  StepStatus,
  StepVerificationRequest,
  VerificationPolicy,
  VerificationRequest,
} from "./types.js";
import { TruthLayerError } from "./truthLayerError.js";
import { SQL_VERIFICATION_OUTCOME_CODE } from "./wireReasonCodes.js";

export const DEFAULT_VERIFICATION_POLICY: VerificationPolicy = {
  consistencyMode: "strong",
  verificationWindowMs: 0,
  pollIntervalMs: 0,
};

export type TimingDeps = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

const defaultTiming: TimingDeps = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type PolicyReconcileContext = {
  reconcileRow: (req: VerificationRequest) => Promise<ReconcileOutput>;
  reconcileRowAbsent: (req: RowAbsentVerificationRequest) => Promise<ReconcileOutput>;
  reconcileRelationalCheck: (check: ResolvedRelationalCheck) => Promise<ReconcileOutput>;
};

export type PolicyExecutionOutput = {
  verificationRequest: StepVerificationRequest;
  status: StepStatus;
  reasons: Reason[];
  evidenceSummary: Record<string, unknown>;
};

type ResolvedOk = Extract<ResolveResult, { ok: true }>;

function mergeTiming(partial?: Partial<TimingDeps>): TimingDeps {
  return {
    now: partial?.now ?? defaultTiming.now,
    sleep: partial?.sleep ?? defaultTiming.sleep,
  };
}

export function normalizeVerificationPolicy(policy: VerificationPolicy): VerificationPolicy {
  if (policy.consistencyMode === "strong") {
    return {
      consistencyMode: "strong",
      verificationWindowMs: 0,
      pollIntervalMs: 0,
    };
  }
  return {
    consistencyMode: "eventual",
    verificationWindowMs: policy.verificationWindowMs,
    pollIntervalMs: policy.pollIntervalMs,
  };
}

export function assertValidVerificationPolicy(policy: VerificationPolicy): void {
  if (policy.consistencyMode === "strong") {
    return;
  }
  if (!Number.isInteger(policy.verificationWindowMs) || policy.verificationWindowMs < 1) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.VERIFICATION_POLICY_INVALID,
      "eventual mode requires integer verificationWindowMs >= 1",
    );
  }
  if (!Number.isInteger(policy.pollIntervalMs) || policy.pollIntervalMs < 1) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.VERIFICATION_POLICY_INVALID,
      "eventual mode requires integer pollIntervalMs >= 1",
    );
  }
  if (policy.pollIntervalMs > policy.verificationWindowMs) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.VERIFICATION_POLICY_INVALID,
      "pollIntervalMs must be <= verificationWindowMs",
    );
  }
}

/** Normalize, validate, and return policy (throws TruthLayerError if invalid). */
export function resolveVerificationPolicyInput(input?: VerificationPolicy): VerificationPolicy {
  const merged = input ?? DEFAULT_VERIFICATION_POLICY;
  const normalized = normalizeVerificationPolicy(merged);
  assertValidVerificationPolicy(normalized);
  return normalized;
}

function reconcileRowsToEffectInput(
  effects: ResolvedEffect[],
  recs: ReconcileOutput[],
): Array<{
  id: string;
  status: StepStatus;
  reasons: Reason[];
  evidenceSummary: Record<string, unknown>;
  table: string;
  identityEq: VerificationRequest["identityEq"];
  requiredFields: VerificationRequest["requiredFields"];
}> {
  return effects.map((e, i) => {
    const rec = recs[i]!;
    return {
      id: e.id,
      status: rec.status,
      reasons: rec.reasons,
      evidenceSummary: rec.evidenceSummary,
      table: e.request.table,
      identityEq: e.request.identityEq,
      requiredFields: e.request.requiredFields,
    };
  });
}

function classifyMultiEffectAfterReconcile(
  effects: ResolvedEffect[],
  recs: ReconcileOutput[],
):
  | { kind: "pending_all_missing" }
  | { kind: "done"; out: ReturnType<typeof rollupMultiEffectsFromReconciledRows> } {
  const rows = reconcileRowsToEffectInput(effects, recs);
  rows.sort((a, b) => compareUtf16Id(a.id, b.id));
  const incomplete = rows.filter((e) => e.status === "incomplete_verification");
  if (incomplete.length > 0) {
    return { kind: "done", out: rollupMultiEffectsFromReconciledRows(rows) };
  }
  const verified = rows.filter((e) => e.status === "verified");
  if (verified.length === rows.length) {
    return { kind: "done", out: rollupMultiEffectsFromReconciledRows(rows) };
  }
  if (rows.every((e) => e.status === "missing")) {
    return { kind: "pending_all_missing" };
  }
  return { kind: "done", out: rollupMultiEffectsFromReconciledRows(rows) };
}

function classifyMultiRelationalAfterReconcile(
  checks: ResolvedRelationalCheck[],
  recs: ReconcileOutput[],
):
  | { kind: "pending_all_missing" }
  | { kind: "done"; out: ReturnType<typeof rollupSqlRelationalFromReconciled> } {
  const pairs = checks.map((check, i) => ({
    id: check.id,
    status: recs[i]!.status,
    reasons: recs[i]!.reasons,
    evidenceSummary: recs[i]!.evidenceSummary,
  }));
  pairs.sort((a, b) => compareUtf16Id(a.id, b.id));
  const incomplete = pairs.filter((e) => e.status === "incomplete_verification");
  if (incomplete.length > 0) {
    return { kind: "done", out: rollupSqlRelationalFromReconciled(checks, recs) };
  }
  const verified = pairs.filter((e) => e.status === "verified");
  if (verified.length === pairs.length) {
    return { kind: "done", out: rollupSqlRelationalFromReconciled(checks, recs) };
  }
  if (pairs.every((e) => e.status === "missing")) {
    return { kind: "pending_all_missing" };
  }
  return { kind: "done", out: rollupSqlRelationalFromReconciled(checks, recs) };
}

function buildUncertainSqlRow(
  request: VerificationRequest,
  attempts: number,
  elapsedMs: number,
  policy: VerificationPolicy,
): PolicyExecutionOutput {
  const { verificationWindowMs, pollIntervalMs } = policy;
  return {
    verificationRequest: request,
    status: "uncertain",
    reasons: [
      {
        code: SQL_VERIFICATION_OUTCOME_CODE.ROW_NOT_OBSERVED_WITHIN_WINDOW,
        message:
          "No row matched the key within the verification window; replication or processing delay is possible.",
      },
    ],
    evidenceSummary: {
      attempts,
      elapsedMs,
      verificationWindowMs,
      pollIntervalMs,
    },
  };
}

function buildUncertainSqlRowAbsent(
  request: RowAbsentVerificationRequest,
  attempts: number,
  elapsedMs: number,
  policy: VerificationPolicy,
  lastRec: ReconcileOutput,
): PolicyExecutionOutput {
  const { verificationWindowMs, pollIntervalMs } = policy;
  const mc = lastRec.evidenceSummary.matchedRowCount;
  const sr = lastRec.evidenceSummary.sampleRows;
  return {
    verificationRequest: request,
    status: "uncertain",
    reasons: [
      {
        code: SQL_VERIFICATION_OUTCOME_CODE.FORBIDDEN_ROWS_STILL_PRESENT_WITHIN_WINDOW,
        message:
          "Forbidden row(s) still present within the verification window; replication or processing delay is possible.",
      },
    ],
    evidenceSummary: {
      attempts,
      elapsedMs,
      verificationWindowMs,
      pollIntervalMs,
      matchedRowCount: typeof mc === "number" && mc >= 1 ? mc : 1,
      sampleRows: Array.isArray(sr) ? sr : [],
    },
  };
}

function buildUncertainSqlEffects(
  effects: ResolvedEffect[],
  recs: ReconcileOutput[],
  attempts: number,
  elapsedMs: number,
  policy: VerificationPolicy,
): PolicyExecutionOutput {
  const { verificationWindowMs, pollIntervalMs } = policy;
  const rows = reconcileRowsToEffectInput(effects, recs);
  rows.sort((a, b) => compareUtf16Id(a.id, b.id));
  const n = rows.length;
  const verificationRequest = {
    kind: "sql_effects" as const,
    effects: rows.map((r) => ({
      id: r.id,
      kind: "sql_row" as const,
      table: r.table,
      identityEq: r.identityEq,
      requiredFields: r.requiredFields,
    })),
  };
  const effectRows = rows.map((r) => ({
    id: r.id,
    status: r.status,
    reasons: r.reasons,
    evidenceSummary: r.evidenceSummary,
  }));
  return {
    verificationRequest,
    status: "uncertain",
    reasons: [
      {
        code: SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_UNCERTAIN_WITHIN_WINDOW,
        message: `Not all effects were observable within the verification window; replication or processing delay is possible (effects: ${rows
          .map((r) => r.id)
          .sort(compareUtf16Id)
          .join(", ")}).`,
      },
    ],
    evidenceSummary: {
      effectCount: n,
      effects: effectRows,
      attempts,
      elapsedMs,
      verificationWindowMs,
      pollIntervalMs,
    },
  };
}

function buildUncertainSqlRelational(
  checks: ResolvedRelationalCheck[],
  recs: ReconcileOutput[],
  attempts: number,
  elapsedMs: number,
  policy: VerificationPolicy,
): PolicyExecutionOutput {
  const { verificationWindowMs, pollIntervalMs } = policy;
  const sortedPairs = checks
    .map((check, i) => ({ check, rec: recs[i]! }))
    .sort((a, b) => compareUtf16Id(a.check.id, b.check.id));
  const sortedChecks = sortedPairs.map((p) => p.check);
  const n = sortedChecks.length;
  const verificationRequest = {
    kind: "sql_relational" as const,
    checks: sortedChecks,
  };
  const effectRows = sortedPairs.map((p) => ({
    id: p.check.id,
    status: p.rec.status,
    reasons: p.rec.reasons,
    evidenceSummary: p.rec.evidenceSummary,
  }));
  return {
    verificationRequest,
    status: "uncertain",
    reasons: [
      {
        code: SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_UNCERTAIN_WITHIN_WINDOW,
        message: `Not all effects were observable within the verification window; replication or processing delay is possible (effects: ${sortedChecks
          .map((c) => c.id)
          .sort(compareUtf16Id)
          .join(", ")}).`,
      },
    ],
    evidenceSummary: {
      effectCount: n,
      effects: effectRows,
      attempts,
      elapsedMs,
      verificationWindowMs,
      pollIntervalMs,
    },
  };
}

function buildUncertainSqlRelationalSingle(
  check: ResolvedRelationalCheck,
  attempts: number,
  elapsedMs: number,
  policy: VerificationPolicy,
): PolicyExecutionOutput {
  const { verificationWindowMs, pollIntervalMs } = policy;
  return {
    verificationRequest: { kind: "sql_relational", checks: [check] },
    status: "uncertain",
    reasons: [
      {
        code: SQL_VERIFICATION_OUTCOME_CODE.ROW_NOT_OBSERVED_WITHIN_WINDOW,
        message:
          "No row matched the key within the verification window; replication or processing delay is possible.",
      },
    ],
    evidenceSummary: {
      attempts,
      elapsedMs,
      verificationWindowMs,
      pollIntervalMs,
    },
  };
}

async function executeSqlRowEventual(
  request: VerificationRequest,
  policy: VerificationPolicy,
  ctx: PolicyReconcileContext,
  timing: TimingDeps,
): Promise<PolicyExecutionOutput> {
  const { verificationWindowMs, pollIntervalMs } = policy;
  const start = timing.now();
  let attempts = 0;
  for (;;) {
    attempts++;
    const rec = await ctx.reconcileRow(request);
    if (rec.status !== "missing") {
      return {
        verificationRequest: request,
        status: rec.status,
        reasons: rec.reasons,
        evidenceSummary: rec.evidenceSummary,
      };
    }
    if (timing.now() - start >= verificationWindowMs) {
      return buildUncertainSqlRow(request, attempts, timing.now() - start, policy);
    }
    await timing.sleep(pollIntervalMs);
  }
}

async function executeSqlRowAbsentEventual(
  request: RowAbsentVerificationRequest,
  policy: VerificationPolicy,
  ctx: PolicyReconcileContext,
  timing: TimingDeps,
): Promise<PolicyExecutionOutput> {
  const { verificationWindowMs, pollIntervalMs } = policy;
  const start = timing.now();
  let attempts = 0;
  for (;;) {
    attempts++;
    const rec = await ctx.reconcileRowAbsent(request);
    if (rec.status === "verified") {
      return {
        verificationRequest: request,
        status: rec.status,
        reasons: rec.reasons,
        evidenceSummary: rec.evidenceSummary,
      };
    }
    if (
      rec.status !== "inconsistent" ||
      rec.reasons[0]?.code !== SQL_VERIFICATION_OUTCOME_CODE.ROW_PRESENT_WHEN_FORBIDDEN
    ) {
      return {
        verificationRequest: request,
        status: rec.status,
        reasons: rec.reasons,
        evidenceSummary: rec.evidenceSummary,
      };
    }
    if (timing.now() - start >= verificationWindowMs) {
      return buildUncertainSqlRowAbsent(request, attempts, timing.now() - start, policy, rec);
    }
    await timing.sleep(pollIntervalMs);
  }
}

async function executeSqlEffectsEventual(
  effects: ResolvedEffect[],
  policy: VerificationPolicy,
  ctx: PolicyReconcileContext,
  timing: TimingDeps,
): Promise<PolicyExecutionOutput> {
  const { verificationWindowMs, pollIntervalMs } = policy;
  const start = timing.now();
  let attempts = 0;
  for (;;) {
    attempts++;
    const recs = await Promise.all(effects.map((e) => ctx.reconcileRow(e.request)));
    const classified = classifyMultiEffectAfterReconcile(effects, recs);
    if (classified.kind === "done") {
      const out = classified.out;
      return {
        verificationRequest: out.verificationRequest,
        status: out.status,
        reasons: out.reasons,
        evidenceSummary: out.evidenceSummary,
      };
    }
    if (timing.now() - start >= verificationWindowMs) {
      return buildUncertainSqlEffects(effects, recs, attempts, timing.now() - start, policy);
    }
    await timing.sleep(pollIntervalMs);
  }
}

async function executeSqlRelationalSingleEventual(
  check: ResolvedRelationalCheck,
  policy: VerificationPolicy,
  ctx: PolicyReconcileContext,
  timing: TimingDeps,
): Promise<PolicyExecutionOutput> {
  const { verificationWindowMs, pollIntervalMs } = policy;
  const start = timing.now();
  let attempts = 0;
  for (;;) {
    attempts++;
    const rec = await ctx.reconcileRelationalCheck(check);
    if (rec.status !== "missing") {
      return {
        verificationRequest: { kind: "sql_relational", checks: [check] },
        status: rec.status,
        reasons: rec.reasons,
        evidenceSummary: rec.evidenceSummary,
      };
    }
    if (timing.now() - start >= verificationWindowMs) {
      return buildUncertainSqlRelationalSingle(check, attempts, timing.now() - start, policy);
    }
    await timing.sleep(pollIntervalMs);
  }
}

async function executeSqlRelationalEventual(
  checks: ResolvedRelationalCheck[],
  policy: VerificationPolicy,
  ctx: PolicyReconcileContext,
  timing: TimingDeps,
): Promise<PolicyExecutionOutput> {
  const { verificationWindowMs, pollIntervalMs } = policy;
  const start = timing.now();
  let attempts = 0;
  for (;;) {
    attempts++;
    const recs = await Promise.all(checks.map((c) => ctx.reconcileRelationalCheck(c)));
    const classified = classifyMultiRelationalAfterReconcile(checks, recs);
    if (classified.kind === "done") {
      const out = classified.out;
      return {
        verificationRequest: out.verificationRequest,
        status: out.status,
        reasons: out.reasons,
        evidenceSummary: out.evidenceSummary,
      };
    }
    if (timing.now() - start >= verificationWindowMs) {
      return buildUncertainSqlRelational(checks, recs, attempts, timing.now() - start, policy);
    }
    await timing.sleep(pollIntervalMs);
  }
}

/** Strong mode only. Throws if policy is not strong after normalization. */
export function executeVerificationWithPolicySync(
  db: DatabaseSync,
  resolved: ResolvedOk,
  policy: VerificationPolicy,
): PolicyExecutionOutput {
  const p = resolveVerificationPolicyInput(policy);
  if (p.consistencyMode !== "strong") {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.INTERNAL_ERROR,
      "executeVerificationWithPolicySync requires strong consistency mode",
    );
  }
  if (resolved.verificationKind === "sql_effects") {
    const rolled = rollupMultiEffectsSync(db, resolved.effects);
    return {
      verificationRequest: rolled.verificationRequest,
      status: rolled.status,
      reasons: rolled.reasons,
      evidenceSummary: rolled.evidenceSummary,
    };
  }
  if (resolved.verificationKind === "sql_relational") {
    const checks = resolved.checks;
    if (checks.length === 1) {
      const check = checks[0]!;
      const rec = reconcileRelationalSqlite(db, check);
      return {
        verificationRequest: { kind: "sql_relational", checks: [check] },
        status: rec.status,
        reasons: rec.reasons,
        evidenceSummary: rec.evidenceSummary,
      };
    }
    const rolled = rollupSqlRelationalSync(db, checks);
    return {
      verificationRequest: rolled.verificationRequest,
      status: rolled.status,
      reasons: rolled.reasons,
      evidenceSummary: rolled.evidenceSummary,
    };
  }
  if (resolved.verificationKind === "sql_row_absent") {
    const rec = reconcileSqlRowAbsent(db, resolved.request);
    return {
      verificationRequest: resolved.request,
      status: rec.status,
      reasons: rec.reasons,
      evidenceSummary: rec.evidenceSummary,
    };
  }
  const rec = reconcileSqlRow(db, resolved.request);
  return {
    verificationRequest: resolved.request,
    status: rec.status,
    reasons: rec.reasons,
    evidenceSummary: rec.evidenceSummary,
  };
}

export async function executeVerificationWithPolicyAsync(
  resolved: ResolvedOk,
  policy: VerificationPolicy,
  ctx: PolicyReconcileContext,
  timing?: Partial<TimingDeps>,
): Promise<PolicyExecutionOutput> {
  const p = resolveVerificationPolicyInput(policy);
  const t = mergeTiming(timing);

  if (p.consistencyMode === "strong") {
    if (resolved.verificationKind === "sql_effects") {
      const recs = await Promise.all(resolved.effects.map((e) => ctx.reconcileRow(e.request)));
      const out = rollupMultiEffectsFromReconciledRows(reconcileRowsToEffectInput(resolved.effects, recs));
      return {
        verificationRequest: out.verificationRequest,
        status: out.status,
        reasons: out.reasons,
        evidenceSummary: out.evidenceSummary,
      };
    }
    if (resolved.verificationKind === "sql_relational") {
      const checks = resolved.checks;
      if (checks.length === 1) {
        const check = checks[0]!;
        const rec = await ctx.reconcileRelationalCheck(check);
        return {
          verificationRequest: { kind: "sql_relational", checks: [check] },
          status: rec.status,
          reasons: rec.reasons,
          evidenceSummary: rec.evidenceSummary,
        };
      }
      const out = await rollupSqlRelationalAsync(ctx.reconcileRelationalCheck, checks);
      return {
        verificationRequest: out.verificationRequest,
        status: out.status,
        reasons: out.reasons,
        evidenceSummary: out.evidenceSummary,
      };
    }
    if (resolved.verificationKind === "sql_row_absent") {
      const rec = await ctx.reconcileRowAbsent(resolved.request);
      return {
        verificationRequest: resolved.request,
        status: rec.status,
        reasons: rec.reasons,
        evidenceSummary: rec.evidenceSummary,
      };
    }
    const rec = await ctx.reconcileRow(resolved.request);
    return {
      verificationRequest: resolved.request,
      status: rec.status,
      reasons: rec.reasons,
      evidenceSummary: rec.evidenceSummary,
    };
  }

  if (resolved.verificationKind === "sql_row_absent") {
    return executeSqlRowAbsentEventual(resolved.request, p, ctx, t);
  }
  if (resolved.verificationKind === "sql_row") {
    return executeSqlRowEventual(resolved.request, p, ctx, t);
  }
  if (resolved.verificationKind === "sql_effects") {
    return executeSqlEffectsEventual(resolved.effects, p, ctx, t);
  }
  const checks = resolved.checks;
  if (checks.length === 1) {
    return executeSqlRelationalSingleEventual(checks[0]!, p, ctx, t);
  }
  return executeSqlRelationalEventual(checks, p, ctx, t);
}

export function createSqlitePolicyContext(db: DatabaseSync): PolicyReconcileContext {
  return {
    reconcileRow: (req) => Promise.resolve(reconcileSqlRow(db, req)),
    reconcileRowAbsent: (req) => Promise.resolve(reconcileSqlRowAbsent(db, req)),
    reconcileRelationalCheck: (check) => Promise.resolve(reconcileRelationalSqlite(db, check)),
  };
}
