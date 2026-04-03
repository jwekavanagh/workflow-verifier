import pg from "pg";
import { ConnectorError } from "./sqlConnector.js";
import type { VerificationRequest } from "./types.js";

export type SqlReadBackend = {
  fetchRows(req: VerificationRequest): Promise<Record<string, unknown>[]>;
};

function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/** Parameterized verification SELECT for SQLite (`?`) or Postgres (`$1`). */
export function buildSelectByKeySql(
  dialect: "sqlite" | "postgres",
  req: VerificationRequest,
): { text: string; values: string[] } {
  const table = quoteIdent(req.table);
  const keyCol = quoteIdent(req.keyColumn);
  const placeholder = dialect === "postgres" ? "$1" : "?";
  const text = `SELECT * FROM ${table} WHERE ${keyCol} = ${placeholder} LIMIT 2`;
  return { text, values: [String(req.keyValue)] };
}

export async function applyPostgresVerificationSessionGuards(client: pg.Client): Promise<void> {
  await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
}

/**
 * Connect, apply session read-only guards, then `SELECT 1` on the same client before any verification query.
 */
export async function connectPostgresVerificationClient(connectionString: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await applyPostgresVerificationSessionGuards(client);
    await client.query("SELECT 1");
  } catch (e) {
    try {
      await client.end();
    } catch {
      /* cleanup only */
    }
    throw e;
  }
  return client;
}

export function createPostgresSqlReadBackend(client: pg.Client): SqlReadBackend {
  return {
    async fetchRows(req: VerificationRequest): Promise<Record<string, unknown>[]> {
      const { text, values } = buildSelectByKeySql("postgres", req);
      try {
        const r = await client.query(text, values);
        return r.rows.map((row) =>
          Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])),
        );
      } catch (e) {
        throw new ConnectorError(e instanceof Error ? e.message : String(e), { cause: e });
      }
    },
  };
}
