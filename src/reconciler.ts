import { formatOperationalMessage } from "./failureCatalog.js";
import { compareUtf16Id } from "./resolveExpectation.js";
import { SQL_VERIFICATION_OUTCOME_CODE } from "./wireReasonCodes.js";
import { ConnectorError, fetchRowsForVerification } from "./sqlConnector.js";
import type { SqlReadBackend } from "./sqlReadBackend.js";
import type { DatabaseSync } from "node:sqlite";
import type { Reason, RowAbsentVerificationRequest, StepStatus, VerificationRequest } from "./types.js";
import { verificationScalarsEqual } from "./valueVerification.js";

export type ReconcileOutput = {
  status: StepStatus;
  reasons: Reason[];
  evidenceSummary: Record<string, unknown>;
};

/** Max rows returned in `sampleRows` for absent / orphan failures (normative). */
export const MAX_VERIFICATION_SAMPLE_ROWS = 3;

function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

function rowKeyContext(req: VerificationRequest): string {
  const t = formatOperationalMessage(req.table);
  const parts = req.identityEq.map(
    (p) => `${formatOperationalMessage(p.column)}=${formatOperationalMessage(p.value)}`,
  );
  return `table=${t} ${parts.join(" ")}`;
}

function absentKeyContext(req: RowAbsentVerificationRequest): string {
  const t = formatOperationalMessage(req.table);
  const idParts = req.identityEq.map(
    (p) => `${formatOperationalMessage(p.column)}=${formatOperationalMessage(p.value)}`,
  );
  const fParts = req.filterEq.map(
    (p) => `${formatOperationalMessage(p.column)}=${formatOperationalMessage(p.value)}`,
  );
  return `table=${t} identity=[${idParts.join(" ")}]${fParts.length ? ` filter=[${fParts.join(" ")}]` : ""}`;
}

/** Parameterized COUNT + SELECT for `sql_row_absent` (shared SQLite / Postgres). */
export function buildRowAbsentSqlPlan(
  dialect: "sqlite" | "postgres",
  req: RowAbsentVerificationRequest,
): { countSql: string; sampleSql: string; values: string[] } {
  const table = quoteIdent(req.table);
  const conds: string[] = [];
  const vals: string[] = [];
  let p = 1;
  const nextPh = () => (dialect === "postgres" ? `$${p++}` : "?");
  for (const pair of req.identityEq) {
    conds.push(`${table}.${quoteIdent(pair.column)} = ${nextPh()}`);
    vals.push(pair.value);
  }
  for (const pair of req.filterEq) {
    conds.push(`${table}.${quoteIdent(pair.column)} = ${nextPh()}`);
    vals.push(pair.value);
  }
  const whereClause = conds.join(" AND ");
  const countSql = `SELECT COUNT(*) AS v FROM ${table} WHERE ${whereClause}`;
  const projSet = new Set<string>();
  for (const x of req.identityEq) projSet.add(x.column);
  for (const x of req.filterEq) projSet.add(x.column);
  const projCols = [...projSet].sort((a, b) => compareUtf16Id(a, b));
  const selectList = projCols.map((c) => `${table}.${quoteIdent(c)}`).join(", ");
  const sampleSql = `SELECT ${selectList} FROM ${table} WHERE ${whereClause} LIMIT ${MAX_VERIFICATION_SAMPLE_ROWS}`;
  return { countSql, sampleSql, values: vals };
}

function normalizeCountV(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "bigint") {
    if (raw >= BigInt(Number.MIN_SAFE_INTEGER) && raw <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(raw);
    }
    return null;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return null;
}

/** Pure rule table after rows are fetched (shared by SQLite and Postgres paths). */
export function reconcileFromRows(rows: Record<string, unknown>[], req: VerificationRequest): ReconcileOutput {
  const n = rows.length;
  const ctx = rowKeyContext(req);
  if (n === 0) {
    return {
      status: "missing",
      reasons: [{ code: SQL_VERIFICATION_OUTCOME_CODE.ROW_ABSENT, message: `No row matched key (${ctx})` }],
      evidenceSummary: { rowCount: 0 },
    };
  }
  if (n >= 2) {
    return {
      status: "inconsistent",
      reasons: [
        { code: SQL_VERIFICATION_OUTCOME_CODE.DUPLICATE_ROWS, message: `More than one row matched key (${ctx})` },
      ],
      evidenceSummary: { rowCount: n },
    };
  }

  const row = rows[0]!;
  const keys = Object.keys(req.requiredFields).sort((a, b) => a.localeCompare(b));

  for (const k of keys) {
    const col = k.toLowerCase();
    if (!(col in row)) {
      return {
        status: "incomplete_verification",
        reasons: [
          { code: SQL_VERIFICATION_OUTCOME_CODE.ROW_SHAPE_MISMATCH, message: `Column not in row: ${k} (${ctx})` },
        ],
        evidenceSummary: { rowCount: 1, rowKeys: Object.keys(row) },
      };
    }
    const actual = row[col];
    if (typeof actual === "object" && actual !== null && !(actual instanceof Date)) {
      return {
        status: "incomplete_verification",
        reasons: [
          {
            code: SQL_VERIFICATION_OUTCOME_CODE.UNREADABLE_VALUE,
            message: `Non-scalar value for ${k} (${ctx})`,
            field: k,
          },
        ],
        evidenceSummary: { rowCount: 1, field: k },
      };
    }

    const expectedVal = req.requiredFields[k]!;
    const cmp = verificationScalarsEqual(expectedVal, actual);
    if (!cmp.ok) {
      const message = `Expected ${cmp.expected} but found ${cmp.actual} for field ${k} (${ctx})`;
      return {
        status: "inconsistent",
        reasons: [{ code: SQL_VERIFICATION_OUTCOME_CODE.VALUE_MISMATCH, message, field: k }],
        evidenceSummary: {
          rowCount: 1,
          field: k,
          expected: cmp.expected,
          actual: cmp.actual,
        },
      };
    }
  }

  return {
    status: "verified",
    reasons: [],
    evidenceSummary: { rowCount: 1 },
  };
}

export function reconcileSqlRow(db: DatabaseSync, req: VerificationRequest): ReconcileOutput {
  let rows: Record<string, unknown>[];
  try {
    rows = fetchRowsForVerification(db, req);
  } catch (e) {
    if (e instanceof ConnectorError) {
      return {
        status: "incomplete_verification",
        reasons: [
          { code: SQL_VERIFICATION_OUTCOME_CODE.CONNECTOR_ERROR, message: formatOperationalMessage(e.message) },
        ],
        evidenceSummary: { rowCount: null, error: true },
      };
    }
    throw e;
  }
  return reconcileFromRows(rows, req);
}

export async function reconcileSqlRowAsync(
  backend: SqlReadBackend,
  req: VerificationRequest,
): Promise<ReconcileOutput> {
  let rows: Record<string, unknown>[];
  try {
    rows = await backend.fetchRows(req);
  } catch (e) {
    if (e instanceof ConnectorError) {
      return {
        status: "incomplete_verification",
        reasons: [
          { code: SQL_VERIFICATION_OUTCOME_CODE.CONNECTOR_ERROR, message: formatOperationalMessage(e.message) },
        ],
        evidenceSummary: { rowCount: null, error: true },
      };
    }
    throw e;
  }
  return reconcileFromRows(rows, req);
}

export function reconcileSqlRowAbsent(db: DatabaseSync, req: RowAbsentVerificationRequest): ReconcileOutput {
  const ctx = absentKeyContext(req);
  const plan = buildRowAbsentSqlPlan("sqlite", req);
  try {
    const countRow = db.prepare(plan.countSql).get(...plan.values) as Record<string, unknown> | undefined;
    const vRaw = countRow === undefined ? undefined : countRow.v ?? countRow.V;
    const cnt = normalizeCountV(vRaw);
    if (cnt === null) {
      return {
        status: "incomplete_verification",
        reasons: [
          {
            code: SQL_VERIFICATION_OUTCOME_CODE.RELATIONAL_SCALAR_UNUSABLE,
            message: formatOperationalMessage(`Absent check: unusable count (${ctx})`),
          },
        ],
        evidenceSummary: { rowCount: null, raw: vRaw },
      };
    }
    if (cnt === 0) {
      return { status: "verified", reasons: [], evidenceSummary: { matchedRowCount: 0 } };
    }
    const sampleStmt = db.prepare(plan.sampleSql);
    const sampleRaw = sampleStmt.all(...plan.values) as Record<string, unknown>[];
    const sampleRows = sampleRaw.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v])),
    );
    return {
      status: "inconsistent",
      reasons: [
        {
          code: SQL_VERIFICATION_OUTCOME_CODE.ROW_PRESENT_WHEN_FORBIDDEN,
          message: formatOperationalMessage(`Row present when forbidden (${ctx}); matched ${cnt}`),
        },
      ],
      evidenceSummary: {
        matchedRowCount: cnt,
        sampleRows,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: "incomplete_verification",
      reasons: [{ code: SQL_VERIFICATION_OUTCOME_CODE.CONNECTOR_ERROR, message: formatOperationalMessage(msg) }],
      evidenceSummary: { error: true },
    };
  }
}

export async function executeRowAbsentPostgres(
  query: (text: string, values: string[]) => Promise<{ rows: Record<string, unknown>[] }>,
  req: RowAbsentVerificationRequest,
): Promise<ReconcileOutput> {
  const ctx = absentKeyContext(req);
  const plan = buildRowAbsentSqlPlan("postgres", req);
  try {
    const r = await query(plan.countSql, plan.values);
    const row0 = r.rows[0];
    const lowered =
      row0 === undefined ? undefined : Object.fromEntries(Object.entries(row0).map(([k, v]) => [k.toLowerCase(), v]));
    const vRaw = lowered?.v;
    const cnt = normalizeCountV(vRaw);
    if (cnt === null) {
      return {
        status: "incomplete_verification",
        reasons: [
          {
            code: SQL_VERIFICATION_OUTCOME_CODE.RELATIONAL_SCALAR_UNUSABLE,
            message: formatOperationalMessage(`Absent check: unusable count (${ctx})`),
          },
        ],
        evidenceSummary: { rowCount: null, raw: vRaw },
      };
    }
    if (cnt === 0) {
      return { status: "verified", reasons: [], evidenceSummary: { matchedRowCount: 0 } };
    }
    const sr = await query(plan.sampleSql, plan.values);
    const sampleRows = sr.rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])),
    );
    return {
      status: "inconsistent",
      reasons: [
        {
          code: SQL_VERIFICATION_OUTCOME_CODE.ROW_PRESENT_WHEN_FORBIDDEN,
          message: formatOperationalMessage(`Row present when forbidden (${ctx}); matched ${cnt}`),
        },
      ],
      evidenceSummary: {
        matchedRowCount: cnt,
        sampleRows,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: "incomplete_verification",
      reasons: [{ code: SQL_VERIFICATION_OUTCOME_CODE.CONNECTOR_ERROR, message: formatOperationalMessage(msg) }],
      evidenceSummary: { error: true },
    };
  }
}
