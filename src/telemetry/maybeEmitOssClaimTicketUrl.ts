import { randomBytes } from "node:crypto";
import { LICENSE_PREFLIGHT_ENABLED } from "../generated/commercialBuildFlags.js";
import { resolveOssClaimApiOrigin } from "./ossClaimOrigin.js";
import { postOssClaimTicket } from "./postOssClaimTicket.js";

export async function maybeEmitOssClaimTicketUrlToStderr(input: {
  run_id: string;
  terminal_status: "complete" | "inconsistent" | "incomplete";
  workload_class: "bundled_examples" | "non_bundled";
  subcommand: "batch_verify" | "quick_verify" | "verify_integrator_owned";
  build_profile: "oss" | "commercial";
}): Promise<void> {
  if (LICENSE_PREFLIGHT_ENABLED) return;
  if (process.env.AGENTSKEPTIC_OSS_CLAIM_STDERR?.trim() === "0") return;
  if (process.env.AGENTSKEPTIC_TELEMETRY?.trim() === "0") return;

  const claim_secret = randomBytes(32).toString("hex");
  const issued_at = new Date().toISOString();
  const ok = await postOssClaimTicket({ claim_secret, issued_at, ...input });
  if (!ok) {
    console.error(
      "[agentskeptic] Could not register a claim link (network). When you are online, run verify again to get a new link, or sign in at the product site without this shortcut.",
    );
    return;
  }
  const url = `${resolveOssClaimApiOrigin()}/claim#${claim_secret}`;
  console.error(`[agentskeptic] Link this verification run to your account (same browser): ${url}`);
}
