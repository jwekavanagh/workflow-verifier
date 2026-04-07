import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { CLI_OPERATIONAL_CODES } from "./failureCatalog.js";
import { TruthLayerError } from "./truthLayerError.js";
import type { ResolvedEffect, VerificationPolicy, VerificationRequest } from "./types.js";
import {
  assertValidVerificationPolicy,
  DEFAULT_VERIFICATION_POLICY,
  executeVerificationWithPolicyAsync,
  executeVerificationWithPolicySync,
  normalizeVerificationPolicy,
  resolveVerificationPolicyInput,
} from "./verificationPolicy.js";

const baseReq: VerificationRequest = {
  kind: "sql_row",
  table: "t",
  identityEq: [{ column: "id", value: "1" }],
  requiredFields: {},
};

const unusedRelationalOk = async () => ({
  status: "verified" as const,
  reasons: [] as { code: string; message: string }[],
  evidenceSummary: {},
});

const unusedReconcileRowAbsent = async () => ({
  status: "verified" as const,
  reasons: [] as { code: string; message: string }[],
  evidenceSummary: {},
});

describe("verificationPolicy", () => {
  it("normalizeVerificationPolicy forces zeros for strong", () => {
    expect(
      normalizeVerificationPolicy({
        consistencyMode: "strong",
        verificationWindowMs: 99,
        pollIntervalMs: 5,
      }),
    ).toEqual({
      consistencyMode: "strong",
      verificationWindowMs: 0,
      pollIntervalMs: 0,
    });
  });

  it("assertValidVerificationPolicy rejects eventual with invalid numbers", () => {
    expect(() =>
      assertValidVerificationPolicy({
        consistencyMode: "eventual",
        verificationWindowMs: 0,
        pollIntervalMs: 1,
      }),
    ).toThrow(TruthLayerError);
    expect(() =>
      assertValidVerificationPolicy({
        consistencyMode: "eventual",
        verificationWindowMs: 1,
        pollIntervalMs: 0,
      }),
    ).toThrow(TruthLayerError);
    expect(() =>
      assertValidVerificationPolicy({
        consistencyMode: "eventual",
        verificationWindowMs: 10,
        pollIntervalMs: 20,
      }),
    ).toThrow(TruthLayerError);
    expect(() =>
      assertValidVerificationPolicy({
        consistencyMode: "eventual",
        verificationWindowMs: 10.5,
        pollIntervalMs: 5,
      }),
    ).toThrow(TruthLayerError);
  });

  it("resolveVerificationPolicyInput accepts DEFAULT", () => {
    expect(resolveVerificationPolicyInput(undefined)).toEqual(DEFAULT_VERIFICATION_POLICY);
  });

  it("executeVerificationWithPolicyAsync strong sql_row calls reconcile once", async () => {
    let calls = 0;
    const ctx = {
      reconcileRow: async () => {
        calls++;
        return {
          status: "verified" as const,
          reasons: [] as { code: string; message: string }[],
          evidenceSummary: { rowCount: 1 },
        };
      },
      reconcileRowAbsent: unusedReconcileRowAbsent,
      reconcileRelationalCheck: unusedRelationalOk,
    };
    const out = await executeVerificationWithPolicyAsync(
      { ok: true, verificationKind: "sql_row", request: baseReq },
      DEFAULT_VERIFICATION_POLICY,
      ctx,
    );
    expect(calls).toBe(1);
    expect(out.status).toBe("verified");
  });

  it("eventual sql_row: missing then verified after one sleep", async () => {
    let calls = 0;
    let t = 0;
    const policy: VerificationPolicy = {
      consistencyMode: "eventual",
      verificationWindowMs: 100,
      pollIntervalMs: 40,
    };
    const ctx = {
      reconcileRow: async () => {
        calls++;
        if (calls === 1) {
          return {
            status: "missing" as const,
            reasons: [{ code: "ROW_ABSENT", message: "No row matched key" }],
            evidenceSummary: { rowCount: 0 },
          };
        }
        return {
          status: "verified" as const,
          reasons: [],
          evidenceSummary: { rowCount: 1 },
        };
      },
      reconcileRowAbsent: unusedReconcileRowAbsent,
      reconcileRelationalCheck: unusedRelationalOk,
    };
    const timing = {
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    };
    const out = await executeVerificationWithPolicyAsync(
      { ok: true, verificationKind: "sql_row", request: baseReq },
      policy,
      ctx,
      timing,
    );
    expect(calls).toBe(2);
    expect(out.status).toBe("verified");
  });

  it("eventual sql_row: always missing until window yields uncertain with evidence", async () => {
    let calls = 0;
    let t = 0;
    const policy: VerificationPolicy = {
      consistencyMode: "eventual",
      verificationWindowMs: 100,
      pollIntervalMs: 50,
    };
    const ctx = {
      reconcileRow: async () => {
        calls++;
        return {
          status: "missing" as const,
          reasons: [{ code: "ROW_ABSENT", message: "No row matched key" }],
          evidenceSummary: { rowCount: 0 },
        };
      },
      reconcileRowAbsent: unusedReconcileRowAbsent,
      reconcileRelationalCheck: unusedRelationalOk,
    };
    const timing = {
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    };
    const out = await executeVerificationWithPolicyAsync(
      { ok: true, verificationKind: "sql_row", request: baseReq },
      policy,
      ctx,
      timing,
    );
    expect(out.status).toBe("uncertain");
    expect(out.reasons[0]?.code).toBe("ROW_NOT_OBSERVED_WITHIN_WINDOW");
    expect(out.evidenceSummary.attempts).toBe(3);
    expect(out.evidenceSummary.verificationWindowMs).toBe(100);
    expect(out.evidenceSummary.pollIntervalMs).toBe(50);
  });

  it("eventual sql_row: inconsistent on first tick does not poll again", async () => {
    let calls = 0;
    const policy: VerificationPolicy = {
      consistencyMode: "eventual",
      verificationWindowMs: 500,
      pollIntervalMs: 50,
    };
    const ctx = {
      reconcileRow: async () => {
        calls++;
        return {
          status: "inconsistent" as const,
          reasons: [{ code: "VALUE_MISMATCH", message: "m" }],
          evidenceSummary: {},
        };
      },
      reconcileRowAbsent: unusedReconcileRowAbsent,
      reconcileRelationalCheck: unusedRelationalOk,
    };
    const timing = {
      now: () => 0,
      sleep: async () => {
        throw new Error("sleep should not be called");
      },
    };
    const out = await executeVerificationWithPolicyAsync(
      { ok: true, verificationKind: "sql_row", request: baseReq },
      policy,
      ctx,
      timing,
    );
    expect(calls).toBe(1);
    expect(out.status).toBe("inconsistent");
  });

  it("eventual sql_row: incomplete_verification stops immediately", async () => {
    let calls = 0;
    const policy: VerificationPolicy = {
      consistencyMode: "eventual",
      verificationWindowMs: 500,
      pollIntervalMs: 50,
    };
    const ctx = {
      reconcileRow: async () => {
        calls++;
        return {
          status: "incomplete_verification" as const,
          reasons: [{ code: "CONNECTOR_ERROR", message: "x" }],
          evidenceSummary: {},
        };
      },
      reconcileRowAbsent: unusedReconcileRowAbsent,
      reconcileRelationalCheck: unusedRelationalOk,
    };
    const out = await executeVerificationWithPolicyAsync(
      { ok: true, verificationKind: "sql_row", request: baseReq },
      policy,
      ctx,
    );
    expect(calls).toBe(1);
    expect(out.status).toBe("incomplete_verification");
  });

  it("eventual sql_effects: all missing until window yields MULTI_EFFECT_UNCERTAIN_WITHIN_WINDOW", async () => {
    const effects: ResolvedEffect[] = [
      { id: "a", request: { ...baseReq, identityEq: [{ column: "id", value: "a" }] } },
      { id: "b", request: { ...baseReq, identityEq: [{ column: "id", value: "b" }] } },
    ];
    let calls = 0;
    let t = 0;
    const policy: VerificationPolicy = {
      consistencyMode: "eventual",
      verificationWindowMs: 80,
      pollIntervalMs: 40,
    };
    const ctx = {
      reconcileRow: async () => {
        calls++;
        return {
          status: "missing" as const,
          reasons: [{ code: "ROW_ABSENT", message: "No row matched key" }],
          evidenceSummary: { rowCount: 0 },
        };
      },
      reconcileRowAbsent: unusedReconcileRowAbsent,
      reconcileRelationalCheck: unusedRelationalOk,
    };
    const timing = {
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    };
    const out = await executeVerificationWithPolicyAsync(
      { ok: true, verificationKind: "sql_effects", effects },
      policy,
      ctx,
      timing,
    );
    expect(out.status).toBe("uncertain");
    expect(out.reasons[0]?.code).toBe("MULTI_EFFECT_UNCERTAIN_WITHIN_WINDOW");
    expect(out.evidenceSummary.effectCount).toBe(2);
    expect(Array.isArray(out.evidenceSummary.effects)).toBe(true);
  });

  it("executeVerificationWithPolicySync rejects eventual mode", () => {
    expect(() =>
      executeVerificationWithPolicySync(
        null as unknown as DatabaseSync,
        { ok: true, verificationKind: "sql_row", request: baseReq },
        { consistencyMode: "eventual", verificationWindowMs: 10, pollIntervalMs: 5 },
      ),
    ).toThrow(TruthLayerError);
  });

  it("resolveVerificationPolicyInput throws VERIFICATION_POLICY_INVALID for bad eventual policy", () => {
    try {
      resolveVerificationPolicyInput({
        consistencyMode: "eventual",
        verificationWindowMs: 5,
        pollIntervalMs: 10,
      });
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TruthLayerError);
      expect((e as TruthLayerError).code).toBe(CLI_OPERATIONAL_CODES.VERIFICATION_POLICY_INVALID);
    }
  });

});
