import { readFileSync, mkdtempSync, rmSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { verifyWorkflow } from "../src/pipeline.js";
import {
  computeMultiCheckRollupStatus,
  rollupMultiEffectsFromReconciledRows,
} from "../src/multiEffectRollup.js";
import { executeVerificationWithPolicyAsync } from "../src/verificationPolicy.js";
import { buildRelationalScalarSql } from "../src/relationalInvariant.js";
import { compareUtf16Id } from "../src/resolveExpectation.js";
import type { ResolvedEffect, ResolvedRelationalCheck, VerificationRequest } from "../src/types.js";
import { SQL_VERIFICATION_OUTCOME_CODE } from "../src/wireReasonCodes.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (...p: string[]) => path.join(root, "test/fixtures/relational-verification", ...p);

describe("relationalVerification requirements (fixtures)", () => {
  let dir: string;
  let dbPath: string;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "etl-rel-req-"));
    dbPath = path.join(dir, "db.sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec(readFileSync(fixture("seed.sql"), "utf8"));
    db.close();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const regPath = fixture("registry.json");
  const eventsPath = fixture("events.ndjson");

  async function runWf(wf: string) {
    return verifyWorkflow({
      workflowId: wf,
      eventsPath,
      registryPath: regPath,
      database: { kind: "sqlite", path: dbPath },
      logStep: () => {},
      truthReport: () => {},
    });
  }

  it("related_exists pass → verified", async () => {
    const r = await runWf("wf_rel_exists_pass");
    expect(r.steps[0]?.status).toBe("verified");
    expect(r.steps[0]?.verificationRequest).toMatchObject({ kind: "sql_relational" });
  });

  it("related_exists fail → missing RELATED_ROWS_ABSENT", async () => {
    const r = await runWf("wf_rel_exists_fail");
    expect(r.steps[0]?.status).toBe("missing");
    expect(r.steps[0]?.reasons[0]?.code).toBe(SQL_VERIFICATION_OUTCOME_CODE.RELATED_ROWS_ABSENT);
  });

  it("aggregate mismatch → RELATIONAL_EXPECTATION_MISMATCH", async () => {
    const r = await runWf("wf_rel_agg_fail");
    expect(r.steps[0]?.status).toBe("inconsistent");
    expect(r.steps[0]?.reasons[0]?.code).toBe(SQL_VERIFICATION_OUTCOME_CODE.RELATIONAL_EXPECTATION_MISMATCH);
  });

  it("join with zero matching rows → RELATIONAL_EXPECTATION_MISMATCH (never RELATED_ROWS_ABSENT)", async () => {
    const r = await runWf("wf_rel_join_zero");
    expect(r.steps[0]?.status).toBe("inconsistent");
    expect(r.steps[0]?.reasons[0]?.code).toBe(SQL_VERIFICATION_OUTCOME_CODE.RELATIONAL_EXPECTATION_MISMATCH);
    expect(r.steps[0]?.reasons[0]?.code).not.toBe(SQL_VERIFICATION_OUTCOME_CODE.RELATED_ROWS_ABSENT);
  });

  it("multi-check partial → MULTI_EFFECT_PARTIAL and two effect rows", async () => {
    const r = await runWf("wf_rel_multi_partial");
    expect(r.steps[0]?.status).toBe("partially_verified");
    expect(r.steps[0]?.reasons[0]?.code).toBe(SQL_VERIFICATION_OUTCOME_CODE.MULTI_EFFECT_PARTIAL);
    const ev = r.steps[0]?.evidenceSummary as { effects?: unknown[]; effectCount?: number };
    expect(ev.effectCount).toBe(2);
    expect(Array.isArray(ev.effects)).toBe(true);
    expect(ev.effects).toHaveLength(2);
  });

  it("rollup parity: computeMultiCheckRollupStatus matches sql_effects rollup for same effect rows", () => {
    const rows = [
      {
        id: "b",
        status: "verified" as const,
        reasons: [] as { code: string; message: string }[],
        evidenceSummary: {},
        table: "t",
        keyColumn: "id",
        keyValue: "b",
        requiredFields: {},
      },
      {
        id: "a",
        status: "missing" as const,
        reasons: [{ code: "ROW_ABSENT", message: "m" }],
        evidenceSummary: {},
        table: "t",
        keyColumn: "id",
        keyValue: "a",
        requiredFields: {},
      },
    ];
    const rolled = rollupMultiEffectsFromReconciledRows(rows);
    const effectRows = rows
      .map((r) => ({
        id: r.id,
        status: r.status,
        reasons: r.reasons,
        evidenceSummary: r.evidenceSummary,
      }))
      .sort((x, y) => compareUtf16Id(x.id, y.id));
    const direct = computeMultiCheckRollupStatus(effectRows);
    expect(rolled.status).toBe(direct.status);
    expect(rolled.reasons[0]?.code).toBe(direct.reasons[0]?.code);
  });

  it("related_exists whereEq pass → verified", async () => {
    const r = await runWf("wf_rel_exists_where_pass");
    expect(r.steps[0]?.status).toBe("verified");
  });

  it("related_exists whereEq fail → missing RELATED_ROWS_ABSENT", async () => {
    const r = await runWf("wf_rel_exists_where_fail");
    expect(r.steps[0]?.status).toBe("missing");
    expect(r.steps[0]?.reasons[0]?.code).toBe(SQL_VERIFICATION_OUTCOME_CODE.RELATED_ROWS_ABSENT);
  });

  it("parameterized SQL: dynamic values only as placeholders", () => {
    const chk: ResolvedRelationalCheck = {
      checkKind: "join_count",
      id: "x",
      leftTable: "rel_orders",
      rightTable: "rel_lines",
      leftJoinColumn: "id",
      rightJoinColumn: "order_id",
      whereEq: [
        { side: "left", column: "id", value: "o1" },
        { side: "right", column: "sku", value: "sku_a" },
      ],
      expectOp: "eq",
      expectValue: 1,
    };
    const sqlite = buildRelationalScalarSql("sqlite", chk);
    expect(sqlite.text.split("?").length - 1).toBe(sqlite.values.length);
    for (const v of sqlite.values) {
      expect(sqlite.text.includes(v)).toBe(false);
    }
    const pg = buildRelationalScalarSql("postgres", chk);
    expect(pg.text).toMatch(/\$1/);
    expect(pg.text).toMatch(/\$2/);
    for (const v of pg.values) {
      expect(pg.text.includes(v)).toBe(false);
    }
  });
});

describe("eventual policy parity (sql_effects vs sql_relational)", () => {
  const policy = {
    consistencyMode: "eventual" as const,
    verificationWindowMs: 120,
    pollIntervalMs: 40,
  };

  const missRow = {
    status: "missing" as const,
    reasons: [{ code: "ROW_ABSENT", message: "m" }],
    evidenceSummary: {},
  };
  const okRow = { status: "verified" as const, reasons: [] as { code: string; message: string }[], evidenceSummary: {} };
  const missRel = {
    status: "missing" as const,
    reasons: [{ code: SQL_VERIFICATION_OUTCOME_CODE.RELATED_ROWS_ABSENT, message: "m" }],
    evidenceSummary: {},
  };

  it("same attempts and final status for two row effects vs two related_exists checks", async () => {
    const baseReq: VerificationRequest = {
      kind: "sql_row",
      table: "t",
      keyColumn: "id",
      keyValue: "1",
      requiredFields: {},
    };
    const effects: ResolvedEffect[] = [
      { id: "a", request: { ...baseReq, keyValue: "a" } },
      { id: "b", request: { ...baseReq, keyValue: "b" } },
    ];
    const checks: ResolvedRelationalCheck[] = [
      {
        checkKind: "related_exists",
        id: "a",
        childTable: "c",
        fkColumn: "k",
        fkValue: "a",
        whereEq: [],
      },
      {
        checkKind: "related_exists",
        id: "b",
        childTable: "c",
        fkColumn: "k",
        fkValue: "b",
        whereEq: [],
      },
    ];

    let callsE = 0;
    const ctxE = {
      reconcileRow: async () => {
        callsE++;
        const wave = Math.floor((callsE - 1) / 2);
        return wave === 0 ? missRow : okRow;
      },
      reconcileRelationalCheck: async () => okRow,
    };

    let callsR = 0;
    const ctxR = {
      reconcileRow: async () => okRow,
      reconcileRelationalCheck: async () => {
        callsR++;
        const wave = Math.floor((callsR - 1) / 2);
        return wave === 0 ? missRel : okRow;
      },
    };

    let t = 0;
    const timing = {
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    };

    const outE = await executeVerificationWithPolicyAsync(
      { ok: true, verificationKind: "sql_effects", effects },
      policy,
      ctxE,
      timing,
    );
    const outR = await executeVerificationWithPolicyAsync(
      { ok: true, verificationKind: "sql_relational", checks },
      policy,
      ctxR,
      timing,
    );

    expect(outE.status).toBe("verified");
    expect(outR.status).toBe("verified");
    expect(callsE).toBe(callsR);
  });
});
