/** Machine-readable Quick Verify ICP; must match schemas/quick-verify-report.schema.json and runQuickVerify.ts. */

export const QUICK_VERIFY_VERSION = "1.1.0" as const;

export const QUICK_SCOPE_LIMITATIONS = [
  "quick_verify_inferred_row_and_related_exists_only",
  "no_multi_effect_contract",
  "no_destructive_or_forbidden_row_contract",
  "contract_replay_export_row_tools_only",
] as const;

export type QuickVerifyScope = {
  quickVerifyVersion: typeof QUICK_VERIFY_VERSION;
  capabilities: readonly ["inferred_row", "inferred_related_exists"];
  limitations: readonly string[];
  ingestContract: "structured_tool_activity";
  groundTruth: "read_only_sql";
};

export const DEFAULT_QUICK_VERIFY_SCOPE: QuickVerifyScope = {
  quickVerifyVersion: QUICK_VERIFY_VERSION,
  capabilities: ["inferred_row", "inferred_related_exists"],
  limitations: [...QUICK_SCOPE_LIMITATIONS],
  ingestContract: "structured_tool_activity",
  groundTruth: "read_only_sql",
};
