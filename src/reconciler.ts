import { ConnectorError, fetchRowsForVerification } from "./sqlConnector.js";
import type { SqlReadBackend } from "./sqlReadBackend.js";
import type { DatabaseSync } from "node:sqlite";
import type { Reason, StepStatus, VerificationRequest } from "./types.js";

export type ReconcileOutput = {
  status: StepStatus;
  reasons: Reason[];
  evidenceSummary: Record<string, unknown>;
};

/** Pure rule table after rows are fetched (shared by SQLite and Postgres paths). */
export function reconcileFromRows(rows: Record<string, unknown>[], req: VerificationRequest): ReconcileOutput {
  const n = rows.length;
  if (n === 0) {
    return {
      status: "missing",
      reasons: [{ code: "ROW_ABSENT", message: "No row matched key" }],
      evidenceSummary: { rowCount: 0 },
    };
  }
  if (n >= 2) {
    return {
      status: "inconsistent",
      reasons: [{ code: "DUPLICATE_ROWS", message: "More than one row matched key" }],
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
        reasons: [{ code: "ROW_SHAPE_MISMATCH", message: `Column not in row: ${k}` }],
        evidenceSummary: { rowCount: 1, rowKeys: Object.keys(row) },
      };
    }
    const actual = row[col];
    if (actual === null || actual === undefined) {
      return {
        status: "partial",
        reasons: [{ code: "NULL_FIELD", message: `Null or missing value for ${k}`, field: k }],
        evidenceSummary: { rowCount: 1, field: k },
      };
    }
    if (typeof actual === "object" && actual !== null && !(actual instanceof Date)) {
      return {
        status: "incomplete_verification",
        reasons: [{ code: "UNREADABLE_VALUE", message: `Non-scalar value for ${k}`, field: k }],
        evidenceSummary: { rowCount: 1, field: k },
      };
    }
    const actualNorm = String(actual).trim();
    const expectedNorm = String(req.requiredFields[k]).trim();
    if (actualNorm !== expectedNorm) {
      return {
        status: "inconsistent",
        reasons: [
          {
            code: "VALUE_MISMATCH",
            message: `Value mismatch for ${k}`,
            field: k,
          },
        ],
        evidenceSummary: { rowCount: 1, field: k },
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
        reasons: [{ code: "CONNECTOR_ERROR", message: e.message }],
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
        reasons: [{ code: "CONNECTOR_ERROR", message: e.message }],
        evidenceSummary: { rowCount: null, error: true },
      };
    }
    throw e;
  }
  return reconcileFromRows(rows, req);
}
