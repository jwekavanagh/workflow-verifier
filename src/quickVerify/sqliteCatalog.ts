import { DatabaseSync } from "node:sqlite";
import type { ColumnInfo, FkEdge, SchemaCatalog, UniqueConstraint } from "./schemaCatalogTypes.js";

export class SqliteSchemaCatalog implements SchemaCatalog {
  readonly dialect = "sqlite" as const;

  constructor(private readonly db: DatabaseSync) {}

  async listTables(): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    const rows = stmt.all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  async listColumns(table: string): Promise<ColumnInfo[]> {
    const stmt = this.db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`);
    const rows = stmt.all() as { name: string }[];
    return rows.map((r) => ({ name: r.name }));
  }

  async primaryKeyColumns(table: string): Promise<string[]> {
    const stmt = this.db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`);
    const rows = stmt.all() as { name: string; pk: number }[];
    return rows.filter((r) => r.pk > 0).map((r) => r.name);
  }

  async listUniqueConstraints(_table: string): Promise<UniqueConstraint[]> {
    return [];
  }

  async listFkEdges(): Promise<FkEdge[]> {
    const tables = await this.listTables();
    const out: FkEdge[] = [];
    const seen = new Set<string>();
    for (const t of tables) {
      const stmt = this.db.prepare(`PRAGMA foreign_key_list("${t.replace(/"/g, '""')}")`);
      const rows = stmt.all() as { table: string; from: string; to: string }[];
      for (const row of rows) {
        const key = `${t}.${row.from}->${row.table}.${row.to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          childTable: t,
          childColumn: row.from,
          parentTable: row.table,
          parentColumn: row.to,
        });
      }
    }
    return out;
  }
}
