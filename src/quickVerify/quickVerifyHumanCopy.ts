/** Single source for quick-verify user-facing strings (see docs/quick-verify-normative Appendix H). */

import { INGEST_AND_QUICK_MISC_PHRASES } from "../verificationUserPhrases.js";
import { userPhraseForReasonCode } from "../verificationUserPhrases.js";

export const MSG_NO_TOOL_CALLS = INGEST_AND_QUICK_MISC_PHRASES.INGEST_NO_ACTIONS;
export const MSG_NO_STRUCTURED_TOOL_ACTIVITY =
  INGEST_AND_QUICK_MISC_PHRASES.INGEST_NO_STRUCTURED_TOOL_ACTIVITY;

export const HUMAN_REPORT_BEGIN = "=== quick-verify human report ===";
export const HUMAN_REPORT_END = "=== end quick-verify human report ===";

export function verdictLine(verdict: "pass" | "fail" | "uncertain"): string {
  return `Verdict: ${verdict}`;
}

const INGEST_REASON_MESSAGES: Record<string, string> = {
  INGEST_INPUT_TOO_LARGE: INGEST_AND_QUICK_MISC_PHRASES.INGEST_INPUT_TOO_LARGE,
  INGEST_NO_ACTIONS: MSG_NO_TOOL_CALLS,
  INGEST_NO_STRUCTURED_TOOL_ACTIVITY: MSG_NO_STRUCTURED_TOOL_ACTIVITY,
  MALFORMED_LINE: INGEST_AND_QUICK_MISC_PHRASES.MALFORMED_LINE,
  INGEST_ACTION_CAP: INGEST_AND_QUICK_MISC_PHRASES.INGEST_ACTION_CAP,
};

export function humanLineForIngestReasonCode(code: string): string {
  return INGEST_REASON_MESSAGES[code] ?? `Ingest: ${code}`;
}

export function humanFragmentForReasonCode(code: string): string {
  return userPhraseForReasonCode(code);
}
