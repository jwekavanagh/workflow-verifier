import { z } from "zod";
import { telemetrySourceWireSchema } from "@/lib/funnelProductActivation.contract";

const issuedAtSchema = z.string().min(1).max(64);

const workloadClassSchema = z.enum(["bundled_examples", "non_bundled"]);
const subcommandSchema = z.enum(["batch_verify", "quick_verify"]);
const buildProfileSchema = z.enum(["oss", "commercial"]);
const terminalStatusSchema = z.enum(["complete", "inconsistent", "incomplete"]);

/** 32 random bytes as lowercase hex (64 chars); URL-safe, no `#`. */
export const ossClaimSecretSchema = z.string().regex(/^[0-9a-f]{64}$/);

const ossClaimTicketCoreSchema = z.object({
  claim_secret: ossClaimSecretSchema,
  run_id: z.string().min(1).max(256),
  issued_at: issuedAtSchema,
  terminal_status: terminalStatusSchema,
  workload_class: workloadClassSchema,
  subcommand: subcommandSchema,
  build_profile: buildProfileSchema,
});

/**
 * v1: shipped CLI shape (no `schema_version`).
 * Reject a present `schema_version` key so invalid v2 bodies cannot match v1 after v2 fails
 * (plain `z.object` strips unknown keys, which would otherwise swallow `schema_version: 2`).
 */
export const ossClaimTicketRequestSchemaV1 = ossClaimTicketCoreSchema.extend({
  schema_version: z.never().optional(),
});

export const ossClaimTicketRequestSchemaV2 = ossClaimTicketCoreSchema.extend({
  schema_version: z.literal(2),
  telemetry_source: telemetrySourceWireSchema,
});

export const ossClaimTicketRequestSchema = z.union([
  ossClaimTicketRequestSchemaV2,
  ossClaimTicketRequestSchemaV1,
]);

export type OssClaimTicketRequest = z.infer<typeof ossClaimTicketRequestSchema>;

export const ossClaimRedeemRequestSchema = z.object({
  claim_secret: ossClaimSecretSchema,
});

export type OssClaimRedeemRequest = z.infer<typeof ossClaimRedeemRequestSchema>;
