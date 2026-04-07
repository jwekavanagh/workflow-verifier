import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { computeMultiCheckRollupStatus, rollupMultiEffectsSync } from "./multiEffectRollup.js";
import type { ResolvedEffect, VerificationRequest } from "./types.js";

vi.mock("./reconciler.js", () => ({
  reconcileSqlRow: vi.fn(),
  reconcileSqlRowAsync: vi.fn(),
}));

import { reconcileSqlRow } from "./reconciler.js";

function req(id: string, fields: Record<string, string | number | boolean | null>): VerificationRequest {
  return {
    kind: "sql_row",
    table: "contacts",
    identityEq: [{ column: "id", value: id }],
    requiredFields: fields,
  };
}

function idFromRequest(r: VerificationRequest): string {
  return r.identityEq.find((p) => p.column === "id")?.value ?? r.identityEq[0]!.value;
}

describe("computeMultiCheckRollupStatus", () => {
  it("all verified → verified empty reasons", () => {
    const out = computeMultiCheckRollupStatus([
      { id: "a", status: "verified", reasons: [], evidenceSummary: {} },
      { id: "b", status: "verified", reasons: [], evidenceSummary: {} },
    ]);
    expect(out.status).toBe("verified");
    expect(out.reasons).toEqual([]);
  });
});

describe("rollupMultiEffectsSync", () => {
  beforeEach(() => {
    vi.mocked(reconcileSqlRow).mockReset();
  });

  it("verified when all effects match", () => {
    vi.mocked(reconcileSqlRow).mockReturnValue({
      status: "verified",
      reasons: [],
      evidenceSummary: { rowCount: 1 },
    });
    const effects: ResolvedEffect[] = [
      { id: "b", request: req("ok2", { name: "B" }) },
      { id: "a", request: req("ok1", { name: "A" }) },
    ];
    const out = rollupMultiEffectsSync({} as DatabaseSync, effects);
    expect(out.status).toBe("verified");
    expect(out.reasons).toEqual([]);
    expect(out.evidenceSummary.effectCount).toBe(2);
    const fx = out.evidenceSummary.effects as Array<{ id: string; status: string }>;
    expect(fx.map((e) => e.id)).toEqual(["a", "b"]);
    expect(out.verificationRequest.kind).toBe("sql_effects");
    expect(out.verificationRequest.effects.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("partially_verified when one value mismatches", () => {
    vi.mocked(reconcileSqlRow).mockImplementation((_db, r) => {
      if (idFromRequest(r) === "ok1") {
        return { status: "verified", reasons: [], evidenceSummary: { rowCount: 1 } };
      }
      return {
        status: "inconsistent",
        reasons: [{ code: "VALUE_MISMATCH", message: "bad" }],
        evidenceSummary: { rowCount: 1 },
      };
    });
    const effects: ResolvedEffect[] = [
      { id: "x", request: req("ok1", { name: "A" }) },
      { id: "y", request: req("bad", { name: "B" }) },
    ];
    const out = rollupMultiEffectsSync({} as DatabaseSync, effects);
    expect(out.status).toBe("partially_verified");
    expect(out.reasons).toEqual([
      {
        code: "MULTI_EFFECT_PARTIAL",
        message: "Verified 1 of 2 effects; not verified: y. Per effect: y (VALUE_MISMATCH)",
      },
    ]);
    const fx = out.evidenceSummary.effects as Array<{ id: string; status: string }>;
    expect(fx.map((e) => e.id)).toEqual(["x", "y"]);
    expect(fx.find((e) => e.id === "y")!.status).toBe("inconsistent");
  });

  it("inconsistent when all effects fail", () => {
    vi.mocked(reconcileSqlRow).mockReturnValue({
      status: "missing",
      reasons: [{ code: "ROW_ABSENT", message: "No row matched key" }],
      evidenceSummary: { rowCount: 0 },
    });
    const effects: ResolvedEffect[] = [
      { id: "m", request: req("missing_a", { name: "X" }) },
      { id: "n", request: req("missing_b", { name: "X" }) },
    ];
    const out = rollupMultiEffectsSync({} as DatabaseSync, effects);
    expect(out.status).toBe("inconsistent");
    expect(out.reasons[0]!.code).toBe("MULTI_EFFECT_ALL_FAILED");
    expect(out.reasons[0]!.message).toBe("All 2 effects failed: m, n. Per effect: m (ROW_ABSENT); n (ROW_ABSENT)");
  });

  it("incomplete_verification when any effect incomplete", () => {
    vi.mocked(reconcileSqlRow).mockImplementation((_db, r) => {
      if (idFromRequest(r) === "ok") {
        return { status: "verified", reasons: [], evidenceSummary: { rowCount: 1 } };
      }
      return {
        status: "incomplete_verification",
        reasons: [{ code: "CONNECTOR_ERROR", message: "x" }],
        evidenceSummary: { rowCount: null },
      };
    });
    const effects: ResolvedEffect[] = [
      { id: "p", request: req("ok", {}) },
      { id: "q", request: req("bad", {}) },
    ];
    const out = rollupMultiEffectsSync({} as DatabaseSync, effects);
    expect(out.status).toBe("incomplete_verification");
    expect(out.reasons[0]!.code).toBe("MULTI_EFFECT_INCOMPLETE");
    expect(out.reasons[0]!.message).toBe("Incomplete verification for effects: q");
  });

  it("incomplete lists multiple effect ids sorted", () => {
    vi.mocked(reconcileSqlRow).mockReturnValue({
      status: "incomplete_verification",
      reasons: [{ code: "CONNECTOR_ERROR", message: "x" }],
      evidenceSummary: {},
    });
    const effects: ResolvedEffect[] = [
      { id: "z", request: req("a", {}) },
      { id: "a", request: req("b", {}) },
    ];
    const out = rollupMultiEffectsSync({} as DatabaseSync, effects);
    expect(out.reasons[0]!.message).toBe("Incomplete verification for effects: a, z");
  });
});
