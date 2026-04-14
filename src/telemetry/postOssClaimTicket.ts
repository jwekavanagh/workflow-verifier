import { AGENTSKEPTIC_CLI_SEMVER } from "../publicDistribution.generated.js";
import { fetchWithTimeout } from "./fetchWithTimeout.js";
import {
  PRODUCT_ACTIVATION_CLI_PRODUCT_HEADER,
  PRODUCT_ACTIVATION_CLI_PRODUCT_VALUE,
  PRODUCT_ACTIVATION_CLI_VERSION_HEADER,
} from "./productActivationHeaders.js";
import { resolveOssClaimApiOrigin } from "./ossClaimOrigin.js";

const OSS_CLAIM_TICKET_FETCH_TIMEOUT_MS = 400;

export type PostOssClaimTicketInput = {
  claim_secret: string;
  run_id: string;
  issued_at: string;
  terminal_status: "complete" | "inconsistent" | "incomplete";
  workload_class: "bundled_examples" | "non_bundled";
  subcommand: "batch_verify" | "quick_verify";
  build_profile: "oss" | "commercial";
};

/**
 * Best-effort POST /api/oss/claim-ticket to canonical origin. Returns whether server accepted (204).
 */
export async function postOssClaimTicket(input: PostOssClaimTicketInput): Promise<boolean> {
  const base = resolveOssClaimApiOrigin();
  const url = `${base}/api/oss/claim-ticket`;
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [PRODUCT_ACTIVATION_CLI_PRODUCT_HEADER]: PRODUCT_ACTIVATION_CLI_PRODUCT_VALUE,
          [PRODUCT_ACTIVATION_CLI_VERSION_HEADER]: AGENTSKEPTIC_CLI_SEMVER,
        },
        body: JSON.stringify({
          claim_secret: input.claim_secret,
          run_id: input.run_id,
          issued_at: input.issued_at,
          terminal_status: input.terminal_status,
          workload_class: input.workload_class,
          subcommand: input.subcommand,
          build_profile: input.build_profile,
        }),
      },
      OSS_CLAIM_TICKET_FETCH_TIMEOUT_MS,
    );
    return res.ok && res.status === 204;
  } catch {
    return false;
  }
}
