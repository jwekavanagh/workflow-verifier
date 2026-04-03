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

export function fetchRowsForVerification(db: DatabaseSync, req: VerificationRequest): Record<string, unknown>[] {
  const sql = `SELECT * FROM ${quoteIdent(req.table)} WHERE ${quoteIdent(req.keyColumn)} = ? LIMIT 2`;
  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all(String(req.keyValue)) as Record<string, unknown>[];
    return rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])),
    );
  } catch (e) {
    throw new ConnectorError(e instanceof Error ? e.message : String(e), { cause: e });
  }
}
