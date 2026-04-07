export type ColumnInfo = { name: string };

export type UniqueConstraint = { columns: string[] };

/** Single-column FK edge (multi-column FK omitted in v1). */
export type FkEdge = {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
};

export interface SchemaCatalog {
  readonly dialect: "postgres" | "sqlite";
  listTables(): Promise<string[]>;
  listColumns(table: string): Promise<ColumnInfo[]>;
  primaryKeyColumns(table: string): Promise<string[]>;
  listUniqueConstraints(table: string): Promise<UniqueConstraint[]>;
  listFkEdges(): Promise<FkEdge[]>;
}
