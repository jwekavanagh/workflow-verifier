import pg from "pg";
import { ConnectorError } from "./sqlConnector.js";
import { executeRowAbsentPostgres } from "./reconciler.js";
import type { ReconcileOutput } from "./reconciler.js";
import type { RowAbsentVerificationRequest, VerificationRequest } from "./types.js";

export type SqlReadBackend = {
  fetchRows(req: VerificationRequest): Promise<Record<string, unknown>[]>;
  reconcileRowAbsent(req: RowAbsentVerificationRequest): Promise<ReconcileOutput>;
};

function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/** Parameterized verification SELECT for Postgres (`$1`, `$2`, …). */
export function buildSelectByIdentitySqlPostgres(req: VerificationRequest): { text: string; values: string[] } {
  const table = quoteIdent(req.table);
  const conds: string[] = [];
  const values: string[] = [];
  let p = 1;
  for (const pair of req.identityEq) {
    conds.push(`${table}.${quoteIdent(pair.column)} = $${p++}`);
    values.push(String(pair.value));
  }
  return {
    text: `SELECT * FROM ${table} WHERE ${conds.join(" AND ")} LIMIT 2`,
    values,
  };
}

export async function applyPostgresVerificationSessionGuards(client: pg.Client): Promise<void> {
  await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
}

/**
 * Connect, apply session read-only guards, then `SELECT 1` on the same client before any verification query.
 */
export async function connectPostgresVerificationClient(connectionString: string): Promise<pg.Client> {
  const client = new pg.Client({
    connectionString,
    /** Avoid indefinite hangs when the host accepts TCP but Postgres never responds. */
    connectionTimeoutMillis: 60_000,
  });
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
      const { text, values } = buildSelectByIdentitySqlPostgres(req);
      try {
        const r = await client.query(text, values);
        return r.rows.map((row) =>
          Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])),
        );
      } catch (e) {
        throw new ConnectorError(e instanceof Error ? e.message : String(e), { cause: e });
      }
    },
    async reconcileRowAbsent(req: RowAbsentVerificationRequest): Promise<ReconcileOutput> {
      return executeRowAbsentPostgres((text, values) => client.query(text, values), req);
    },
  };
}
