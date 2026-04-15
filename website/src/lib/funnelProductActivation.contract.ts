import { z } from "zod";

const issuedAtSchema = z.string().min(1).max(64);

const workloadClassSchema = z.enum(["bundled_examples", "non_bundled"]);
const subcommandSchema = z.enum(["batch_verify", "quick_verify"]);
const buildProfileSchema = z.enum(["oss", "commercial"]);
const terminalStatusSchema = z.enum(["complete", "inconsistent", "incomplete"]);

export const telemetrySourceWireSchema = z.enum(["local_dev", "unknown"]);

const cliVersionSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+._a-zA-Z0-9]*)?$/);

const optionalFunnelAnonIdSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().uuid().optional(),
);

const optionalInstallIdSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().uuid().optional(),
);

export const productActivationVerifyStartedSchemaV1 = z.object({
  event: z.literal("verify_started"),
  schema_version: z.literal(1),
  run_id: z.string().min(1).max(256),
  issued_at: issuedAtSchema,
  workload_class: workloadClassSchema,
  subcommand: subcommandSchema,
  build_profile: buildProfileSchema,
  funnel_anon_id: optionalFunnelAnonIdSchema,
  install_id: optionalInstallIdSchema,
});

export const productActivationVerifyStartedSchemaV2 = z.object({
  event: z.literal("verify_started"),
  schema_version: z.literal(2),
  run_id: z.string().min(1).max(256),
  issued_at: issuedAtSchema,
  workload_class: workloadClassSchema,
  subcommand: subcommandSchema,
  build_profile: buildProfileSchema,
  telemetry_source: telemetrySourceWireSchema,
  funnel_anon_id: optionalFunnelAnonIdSchema,
  install_id: optionalInstallIdSchema,
});

export const productActivationVerifyOutcomeSchemaV1 = z.object({
  event: z.literal("verify_outcome"),
  schema_version: z.literal(1),
  run_id: z.string().min(1).max(256),
  issued_at: issuedAtSchema,
  workload_class: workloadClassSchema,
  subcommand: subcommandSchema,
  build_profile: buildProfileSchema,
  terminal_status: terminalStatusSchema,
  funnel_anon_id: optionalFunnelAnonIdSchema,
  install_id: optionalInstallIdSchema,
});

export const productActivationVerifyOutcomeSchemaV2 = z.object({
  event: z.literal("verify_outcome"),
  schema_version: z.literal(2),
  run_id: z.string().min(1).max(256),
  issued_at: issuedAtSchema,
  workload_class: workloadClassSchema,
  subcommand: subcommandSchema,
  build_profile: buildProfileSchema,
  terminal_status: terminalStatusSchema,
  telemetry_source: telemetrySourceWireSchema,
  funnel_anon_id: optionalFunnelAnonIdSchema,
  install_id: optionalInstallIdSchema,
});

/** @deprecated use V1/V2 schemas; kept for tests that referenced old export names */
export const productActivationVerifyStartedSchema = productActivationVerifyStartedSchemaV1;
/** @deprecated */
export const productActivationVerifyOutcomeSchema = productActivationVerifyOutcomeSchemaV1;

export const productActivationRequestSchema = z.union([
  productActivationVerifyStartedSchemaV1,
  productActivationVerifyStartedSchemaV2,
  productActivationVerifyOutcomeSchemaV1,
  productActivationVerifyOutcomeSchemaV2,
]);

export type ProductActivationRequest = z.infer<typeof productActivationRequestSchema>;

export { cliVersionSchema };
