import type { DatabaseSync } from "node:sqlite";
import { formatOperationalMessage } from "./failureCatalog.js";
import { reconcileRelationalSqlite } from "./relationalInvariant.js";
import { reconcileSqlRow, reconcileSqlRowAsync } from "./reconciler.js";
import type { SqlReadBackend } from "./sqlReadBackend.js";
import type {
  IdentityEqPair,
  Reason,
  ResolvedEffect,
  ResolvedRelationalCheck,
  SqlEffectsVerificationPayload,
  SqlRelationalVerificationPayload,
  StepStatus,
  VerificationScalar,
} from "./types.js";
import { compareUtf16Id } from "./resolveExpectation.js";
import { SQL_VERIFICATION_OUTCOME_CODE } from "./wireReasonCodes.js";

export type MultiEffectRollupOutput = {
  verificationRequest: SqlEffectsVerificationPayload;
  status: StepStatus;
  reasons: Reason[];
  evidenceSummary: Record<string, unknown>;
};

export type SqlRelationalRollupOutput = {
  verificationRequest: SqlRelationalVerificationPayload;
  status: StepStatus;
  reasons: Reason[];
  evidenceSummary: Record<string, unknown>;
};

type EffectRow = {
  id: string;
  status: StepStatus;
  reasons: Reason[];
  evidenceSummary: Record<string, unknown>;
};

/** Sorted by effect id; each segment is `id (firstReasonCode)`. */
function formatPerEffectFailureCodes(rows: EffectRow[]): string {
  const parts = [...rows]
    .sort((a, b) => compareUtf16Id(a.id, b.id))
    .map((e) => {
      const code = e.reasons[0]?.code ?? "UNKNOWN";
      return `${e.id} (${code})`;
    });
  return parts.join("; ");
}

/** Shared status machine for sql_effects and sql_relational multi-check rollups. */
export function computeMultiCheckRollupStatus(effectRows: EffectRow[]): {
  status: StepStatus;
  reasons: Reason[];
} {
  const n = effectRows.length;
  const incomplete = effectRows.filter((e) => e.status === "incomplete_verification");
  const verified = effectRows.filter((e) => e.status === "verified");

  if (incomplete.length > 0) {
    const ids = incomplete.map((e) => e.id).sort(compareUtf16Id);
    return {
      status: "incomplete_verification",
      reasons: [
        {
          code: SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_INCOMPLETE,
          message: `Incomplete verification for effects: ${ids.join(", ")}`,
        },
      ],
    };
  }
  if (verified.length === n) {
    return { status: "verified", reasons: [] };
  }
  if (verified.length === 0) {
    const ids = effectRows.map((e) => e.id).sort(compareUtf16Id);
    const detail = formatPerEffectFailureCodes(effectRows);
    return {
      status: "inconsistent",
      reasons: [
        {
          code: SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_ALL_FAILED,
          message: formatOperationalMessage(
            `All ${n} effects failed: ${ids.join(", ")}. Per effect: ${detail}`,
          ),
        },
      ],
    };
  }
  const badRows = effectRows.filter((e) => e.status === "missing" || e.status === "inconsistent");
  const bad = badRows.map((e) => e.id).sort(compareUtf16Id);
  const detail = formatPerEffectFailureCodes(badRows);
  return {
    status: "partially_verified",
    reasons: [
      {
        code: SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_PARTIAL,
        message: formatOperationalMessage(
          `Verified ${verified.length} of ${n} effects; not verified: ${bad.join(", ")}. Per effect: ${detail}`,
        ),
      },
    ],
  };
}

function buildRollup(
  sorted: Array<{
    id: string;
    status: StepStatus;
    reasons: Reason[];
    evidenceSummary: Record<string, unknown>;
    table: string;
    identityEq: IdentityEqPair[];
    requiredFields: Record<string, string | number | boolean | null>;
  }>,
): MultiEffectRollupOutput {
  const n = sorted.length;
  const verificationRequest: SqlEffectsVerificationPayload = {
    kind: "sql_effects",
    effects: sorted.map((r) => ({
      id: r.id,
      kind: "sql_row" as const,
      table: r.table,
      identityEq: r.identityEq,
      requiredFields: r.requiredFields,
    })),
  };

  const effectRows: EffectRow[] = sorted.map((r) => ({
    id: r.id,
    status: r.status,
    reasons: r.reasons,
    evidenceSummary: r.evidenceSummary,
  }));

  const { status, reasons } = computeMultiCheckRollupStatus(effectRows);

  return {
    verificationRequest,
    status,
    reasons,
    evidenceSummary: {
      effectCount: n,
      effects: effectRows,
    },
  };
}

/** Build rollup from per-effect reconcile rows (sorted by effect id). Used by verification policy executor. */
export function rollupMultiEffectsFromReconciledRows(
  rows: Array<{
    id: string;
    status: StepStatus;
    reasons: Reason[];
    evidenceSummary: Record<string, unknown>;
    table: string;
    identityEq: IdentityEqPair[];
    requiredFields: Record<string, VerificationScalar>;
  }>,
): MultiEffectRollupOutput {
  const sorted = [...rows].sort((a, b) => compareUtf16Id(a.id, b.id));
  return buildRollup(sorted);
}

export function rollupMultiEffectsSync(db: DatabaseSync, effects: ResolvedEffect[]): MultiEffectRollupOutput {
  const rows = effects.map((e) => {
    const rec = reconcileSqlRow(db, e.request);
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
  rows.sort((a, b) => compareUtf16Id(a.id, b.id));
  return buildRollup(rows);
}

export async function rollupMultiEffectsAsync(
  backend: SqlReadBackend,
  effects: ResolvedEffect[],
): Promise<MultiEffectRollupOutput> {
  const rows = await Promise.all(
    effects.map(async (e) => {
      const rec = await reconcileSqlRowAsync(backend, e.request);
      return {
        id: e.id,
        status: rec.status,
        reasons: rec.reasons,
        evidenceSummary: rec.evidenceSummary,
        table: e.request.table,
        identityEq: e.request.identityEq,
        requiredFields: e.request.requiredFields,
      };
    }),
  );
  rows.sort((a, b) => compareUtf16Id(a.id, b.id));
  return buildRollup(rows);
}

function rollupRelationalMulti(
  sortedChecks: ResolvedRelationalCheck[],
  effectRows: EffectRow[],
): SqlRelationalRollupOutput {
  const n = effectRows.length;
  const { status, reasons } = computeMultiCheckRollupStatus(effectRows);
  return {
    verificationRequest: { kind: "sql_relational", checks: sortedChecks },
    status,
    reasons,
    evidenceSummary: {
      effectCount: n,
      effects: effectRows,
    },
  };
}

export function rollupSqlRelationalFromReconciled(
  checks: ResolvedRelationalCheck[],
  recs: import("./reconciler.js").ReconcileOutput[],
): SqlRelationalRollupOutput {
  const pairs = checks.map((check, i) => ({
    check,
    rec: recs[i]!,
  }));
  pairs.sort((a, b) => compareUtf16Id(a.check.id, b.check.id));
  const sortedChecks = pairs.map((p) => p.check);
  const effectRows: EffectRow[] = pairs.map((p) => ({
    id: p.check.id,
    status: p.rec.status,
    reasons: p.rec.reasons,
    evidenceSummary: p.rec.evidenceSummary,
  }));
  return rollupRelationalMulti(sortedChecks, effectRows);
}

export function rollupSqlRelationalSync(db: DatabaseSync, checks: ResolvedRelationalCheck[]): SqlRelationalRollupOutput {
  const recs = checks.map((c) => reconcileRelationalSqlite(db, c));
  return rollupSqlRelationalFromReconciled(checks, recs);
}

export async function rollupSqlRelationalAsync(
  reconcileRelationalCheck: (check: ResolvedRelationalCheck) => Promise<import("./reconciler.js").ReconcileOutput>,
  checks: ResolvedRelationalCheck[],
): Promise<SqlRelationalRollupOutput> {
  const recs = await Promise.all(checks.map((c) => reconcileRelationalCheck(c)));
  return rollupSqlRelationalFromReconciled(checks, recs);
}
