import { compareUtf16Id } from "../resolveExpectation.js";
import type { VerificationRequest } from "../types.js";

export type QuickContractExport = { toolId: string; request: VerificationRequest };

/**
 * Synthetic tool_observed NDJSON (schemaVersion 1) for contract replay.
 * Empty exports → caller writes a zero-byte file (no trailing newline).
 */
export function buildQuickContractEventsNdjson(input: {
  workflowId: string;
  exports: QuickContractExport[];
}): string {
  if (input.exports.length === 0) return "";
  const lines: string[] = [];
  for (let seq = 0; seq < input.exports.length; seq++) {
    const { toolId, request } = input.exports[seq]!;
    const __qvFields: Record<string, string | number | boolean | null> = {};
    for (const k of Object.keys(request.requiredFields).sort(compareUtf16Id)) {
      __qvFields[k] = request.requiredFields[k]!;
    }
    const line = {
      schemaVersion: 1,
      workflowId: input.workflowId,
      seq,
      type: "tool_observed",
      toolId,
      params: { __qvFields },
    };
    lines.push(JSON.stringify(line));
  }
  return `${lines.join("\n")}\n`;
}
