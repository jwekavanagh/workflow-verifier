import type { ToolRegistryEntry, VerificationRequest } from "../types.js";

/**
 * Build Advanced-mode registry entry for a row unit (sql_row + pointers for dynamic fields).
 */
export function exportSqlRowTool(toolId: string, req: VerificationRequest): ToolRegistryEntry {
  const identityEq = req.identityEq.map((p) => ({
    column: { const: p.column },
    value: { const: p.value },
  }));
  return {
    toolId,
    effectDescriptionTemplate: `Quick inferred row: ${req.table}`,
    verification: {
      kind: "sql_row",
      table: { const: req.table },
      identityEq,
      requiredFields: { pointer: "/__qvFields" },
    },
  } as ToolRegistryEntry;
}
