import {
  LICENSE_API_BASE_URL,
  LICENSE_PREFLIGHT_ENABLED,
} from "../generated/commercialBuildFlags.js";
import { fetchWithTimeout } from "../telemetry/fetchWithTimeout.js";

export type VerifyOutcomeSubcommand = "batch_verify" | "quick_verify" | "verify_integrator_owned";
export type VerifyOutcomeTerminalStatus = "complete" | "inconsistent" | "incomplete";
export type VerifyOutcomeWorkloadClass = "bundled_examples" | "non_bundled";

/**
 * Best-effort POST to license origin. Never throws; never logs secrets.
 */
export async function postVerifyOutcomeBeacon(input: {
  runId: string | null;
  terminal_status: VerifyOutcomeTerminalStatus;
  workload_class: VerifyOutcomeWorkloadClass;
  subcommand: VerifyOutcomeSubcommand;
}): Promise<void> {
  if (!LICENSE_PREFLIGHT_ENABLED || input.runId === null) return;

  const apiKey =
    process.env.AGENTSKEPTIC_API_KEY?.trim() ||
    process.env.WORKFLOW_VERIFIER_API_KEY?.trim();
  if (!apiKey) return;

  const url = `${LICENSE_API_BASE_URL.replace(/\/$/, "")}/api/v1/funnel/verify-outcome`;
  try {
    await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_id: input.runId,
          terminal_status: input.terminal_status,
          workload_class: input.workload_class,
          subcommand: input.subcommand,
        }),
      },
      400,
    );
  } catch {
    /* ignore */
  }
}
