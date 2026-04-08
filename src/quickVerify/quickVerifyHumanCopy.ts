/** Single source for quick-verify user-facing strings (see docs/quick-verify-normative Appendix H). */

export const MSG_NO_TOOL_CALLS = "No tool calls detected in input.";

export const HUMAN_REPORT_BEGIN = "=== quick-verify human report ===";
export const HUMAN_REPORT_END = "=== end quick-verify human report ===";

export function verdictLine(verdict: "pass" | "fail" | "uncertain"): string {
  return `Verdict: ${verdict}`;
}

const INGEST_REASON_MESSAGES: Record<string, string> = {
  INGEST_INPUT_TOO_LARGE: "Input exceeded the maximum allowed size.",
  INGEST_NO_ACTIONS: MSG_NO_TOOL_CALLS,
  MALFORMED_LINE: "One or more lines could not be parsed as JSON.",
  INGEST_ACTION_CAP: "Action limit reached; extra tool calls were ignored.",
};

export function humanLineForIngestReasonCode(code: string): string {
  return INGEST_REASON_MESSAGES[code] ?? `Ingest: ${code}`;
}

export function humanFragmentForReasonCode(code: string): string {
  if (code === "ROW_ABSENT") return "No matching row (success claimed but nothing found).";
  if (code === "DUPLICATE_ROWS") return "Multiple rows matched the same key.";
  if (code === "VALUE_MISMATCH") return "Wrong value in database for a required field.";
  if (code === "RELATED_ROWS_ABSENT") return "Related row missing for an expected foreign-key link.";
  if (code === "CONNECTOR_ERROR") return "Database query failed.";
  if (code.startsWith("MAPPING_")) return `Mapping: ${code.replace(/^MAPPING_/, "").toLowerCase().replace(/_/g, " ")}.`;
  return code;
}
