import type { LicensedVerifyOutcomeMetadata } from "@/lib/funnelCommercialMetadata";

export const ACCOUNT_ACTIVITY_SCOPE_LINE =
  "Each line shows a recent verification run reported by your API key—not a live audit of your database.";

const STATUS_LABEL: Record<LicensedVerifyOutcomeMetadata["terminal_status"], string> = {
  complete: "Reported: complete",
  inconsistent: "Reported: inconsistent",
  incomplete: "Reported: incomplete",
};

export function accountActivityStatusLabel(
  terminalStatus: LicensedVerifyOutcomeMetadata["terminal_status"],
): string {
  return STATUS_LABEL[terminalStatus];
}

export function accountActivityMetaLine(
  workloadClass: LicensedVerifyOutcomeMetadata["workload_class"],
  subcommand: LicensedVerifyOutcomeMetadata["subcommand"],
): string {
  return `Mode: ${workloadClass} · Command: ${subcommand}`;
}
