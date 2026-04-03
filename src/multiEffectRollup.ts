import type { DatabaseSync } from "node:sqlite";
import { reconcileSqlRow, reconcileSqlRowAsync } from "./reconciler.js";
import type { SqlReadBackend } from "./sqlReadBackend.js";
import type { Reason, ResolvedEffect, SqlEffectsVerificationPayload, StepStatus } from "./types.js";
import { compareUtf16Id } from "./resolveExpectation.js";

export type MultiEffectRollupOutput = {
  verificationRequest: SqlEffectsVerificationPayload;
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

function buildRollup(
  sorted: Array<{
    id: string;
    status: StepStatus;
    reasons: Reason[];
    evidenceSummary: Record<string, unknown>;
    table: string;
    keyColumn: string;
    keyValue: string;
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
      keyColumn: r.keyColumn,
      keyValue: r.keyValue,
      requiredFields: r.requiredFields,
    })),
  };

  const effectRows: EffectRow[] = sorted.map((r) => ({
    id: r.id,
    status: r.status,
    reasons: r.reasons,
    evidenceSummary: r.evidenceSummary,
  }));

  const incomplete = effectRows.filter((e) => e.status === "incomplete_verification");
  const verified = effectRows.filter((e) => e.status === "verified");

  let status: StepStatus;
  let reasons: Reason[];

  if (incomplete.length > 0) {
    status = "incomplete_verification";
    const ids = incomplete.map((e) => e.id).sort(compareUtf16Id);
    reasons = [
      {
        code: "MULTI_EFFECT_INCOMPLETE",
        message: `Incomplete verification for effects: ${ids.join(", ")}`,
      },
    ];
  } else if (verified.length === n) {
    status = "verified";
    reasons = [];
  } else if (verified.length === 0) {
    status = "inconsistent";
    const ids = effectRows.map((e) => e.id).sort(compareUtf16Id);
    reasons = [
      {
        code: "MULTI_EFFECT_ALL_FAILED",
        message: `All ${n} effects failed: ${ids.join(", ")}`,
      },
    ];
  } else {
    status = "partially_verified";
    const bad = effectRows
      .filter((e) => e.status === "missing" || e.status === "inconsistent")
      .map((e) => e.id)
      .sort(compareUtf16Id);
    reasons = [
      {
        code: "MULTI_EFFECT_PARTIAL",
        message: `Verified ${verified.length} of ${n} effects; not verified: ${bad.join(", ")}`,
      },
    ];
  }

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

export function rollupMultiEffectsSync(db: DatabaseSync, effects: ResolvedEffect[]): MultiEffectRollupOutput {
  const rows = effects.map((e) => {
    const rec = reconcileSqlRow(db, e.request);
    return {
      id: e.id,
      status: rec.status,
      reasons: rec.reasons,
      evidenceSummary: rec.evidenceSummary,
      table: e.request.table,
      keyColumn: e.request.keyColumn,
      keyValue: e.request.keyValue,
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
        keyColumn: e.request.keyColumn,
        keyValue: e.request.keyValue,
        requiredFields: e.request.requiredFields,
      };
    }),
  );
  rows.sort((a, b) => compareUtf16Id(a.id, b.id));
  return buildRollup(rows);
}
