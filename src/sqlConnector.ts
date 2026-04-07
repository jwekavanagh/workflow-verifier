import type { DatabaseSync } from "node:sqlite";
import type { VerificationRequest } from "./types.js";

export class ConnectorError extends Error {
  readonly code = "CONNECTOR_ERROR";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ConnectorError";
  }
}

function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/** Shared SELECT * … LIMIT 2 for positive row verification (SQLite `?`). */
export function buildSelectByIdentitySqlSqlite(req: VerificationRequest): { text: string; values: string[] } {
  const table = quoteIdent(req.table);
  const conds: string[] = [];
  const values: string[] = [];
  for (const pair of req.identityEq) {
    conds.push(`${table}.${quoteIdent(pair.column)} = ?`);
    values.push(String(pair.value));
  }
  return {
    text: `SELECT * FROM ${table} WHERE ${conds.join(" AND ")} LIMIT 2`,
    values,
  };
}

export function fetchRowsForVerification(db: DatabaseSync, req: VerificationRequest): Record<string, unknown>[] {
  const { text, values } = buildSelectByIdentitySqlSqlite(req);
  try {
    const stmt = db.prepare(text);
    const rows = stmt.all(...values) as Record<string, unknown>[];
    return rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])),
    );
  } catch (e) {
    throw new ConnectorError(e instanceof Error ? e.message : String(e), { cause: e });
  }
}
