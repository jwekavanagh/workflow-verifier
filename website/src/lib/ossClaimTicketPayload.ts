import { z } from "zod";

const issuedAtSchema = z.string().min(1).max(64);

const workloadClassSchema = z.enum(["bundled_examples", "non_bundled"]);
const subcommandSchema = z.enum(["batch_verify", "quick_verify"]);
const buildProfileSchema = z.enum(["oss", "commercial"]);
const terminalStatusSchema = z.enum(["complete", "inconsistent", "incomplete"]);

/** 32 random bytes as lowercase hex (64 chars); URL-safe, no `#`. */
export const ossClaimSecretSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const ossClaimTicketRequestSchema = z.object({
  claim_secret: ossClaimSecretSchema,
  run_id: z.string().min(1).max(256),
  issued_at: issuedAtSchema,
  terminal_status: terminalStatusSchema,
  workload_class: workloadClassSchema,
  subcommand: subcommandSchema,
  build_profile: buildProfileSchema,
});

export type OssClaimTicketRequest = z.infer<typeof ossClaimTicketRequestSchema>;

export const ossClaimRedeemRequestSchema = z.object({
  claim_secret: ossClaimSecretSchema,
});

export type OssClaimRedeemRequest = z.infer<typeof ossClaimRedeemRequestSchema>;
