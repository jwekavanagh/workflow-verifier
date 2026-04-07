import type pg from "pg";
import type { ColumnInfo, FkEdge, SchemaCatalog, UniqueConstraint } from "./schemaCatalogTypes.js";

export class PostgresSchemaCatalog implements SchemaCatalog {
  readonly dialect = "postgres" as const;

  constructor(private readonly client: pg.Client) {}

  async listTables(): Promise<string[]> {
    const r = await this.client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    return (r.rows as { table_name: string }[]).map((x) => x.table_name);
  }

  async listColumns(table: string): Promise<ColumnInfo[]> {
    const r = await this.client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table],
    );
    return (r.rows as { column_name: string }[]).map((x) => ({ name: x.column_name }));
  }

  async primaryKeyColumns(table: string): Promise<string[]> {
    const r = await this.client.query(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
       ORDER BY kcu.ordinal_position`,
      [table],
    );
    return (r.rows as { column_name: string }[]).map((x) => x.column_name);
  }

  async listUniqueConstraints(table: string): Promise<UniqueConstraint[]> {
    const r = await this.client.query(
      `SELECT tc.constraint_name, kcu.column_name, kcu.ordinal_position
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'UNIQUE'
       ORDER BY tc.constraint_name, kcu.ordinal_position`,
      [table],
    );
    const byName = new Map<string, string[]>();
    for (const row of r.rows as { constraint_name: string; column_name: string }[]) {
      const arr = byName.get(row.constraint_name) ?? [];
      arr.push(row.column_name);
      byName.set(row.constraint_name, arr);
    }
    return [...byName.values()].map((columns) => ({ columns }));
  }

  async listFkEdges(): Promise<FkEdge[]> {
    const r = await this.client.query(
      `SELECT
         kcu.table_name AS child_table,
         kcu.column_name AS child_column,
         ccu.table_name AS parent_table,
         ccu.column_name AS parent_column
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
       ORDER BY kcu.table_name, kcu.column_name`,
    );
    const out: FkEdge[] = [];
    const seen = new Set<string>();
    for (const row of r.rows as {
      child_table: string;
      child_column: string;
      parent_table: string;
      parent_column: string;
    }[]) {
      const key = `${row.child_table}.${row.child_column}->${row.parent_table}.${row.parent_column}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        childTable: row.child_table,
        childColumn: row.child_column,
        parentTable: row.parent_table,
        parentColumn: row.parent_column,
      });
    }
    return out;
  }
}
