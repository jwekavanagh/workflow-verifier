import {
  isValidVerificationHypothesisWireValue,
  normalizeVerificationHypothesisInput,
  VERIFICATION_HYPOTHESIS_MAX_LEN,
} from "agentskeptic/verificationHypothesisContract";
import { z } from "zod";

/** Present key must be non-empty after trim and satisfy charset; absent key stays absent. */
const verificationHypothesisOptional = z.optional(
  z.union([
    z.undefined(),
    z.string().superRefine((raw, ctx) => {
      const t = normalizeVerificationHypothesisInput(raw);
      if (raw.length > 0 && t.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "verification_hypothesis_whitespace_only",
        });
        return;
      }
      if (t.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "verification_hypothesis_empty",
        });
        return;
      }
      if (t.length > VERIFICATION_HYPOTHESIS_MAX_LEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "verification_hypothesis_too_long",
        });
        return;
      }
      if (!isValidVerificationHypothesisWireValue(t)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "verification_hypothesis_invalid_charset",
        });
      }
    }),
  ]),
);

const issuedAtSchema = z.string().min(1).max(64);

const workloadClassSchema = z.enum(["bundled_examples", "non_bundled"]);
const workflowLineageSchema = z.enum([
  "catalog_shipped",
  "integrate_spine",
  "integrator_scoped",
  "unknown",
]);
const subcommandSchema = z.enum(["batch_verify", "quick_verify", "verify_integrator_owned"]);
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
  verification_hypothesis: verificationHypothesisOptional,
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
  verification_hypothesis: verificationHypothesisOptional,
});

export const productActivationVerifyStartedSchemaV3 = z.object({
  event: z.literal("verify_started"),
  schema_version: z.literal(3),
  run_id: z.string().min(1).max(256),
  issued_at: issuedAtSchema,
  workload_class: workloadClassSchema,
  workflow_lineage: workflowLineageSchema,
  subcommand: subcommandSchema,
  build_profile: buildProfileSchema,
  telemetry_source: telemetrySourceWireSchema,
  funnel_anon_id: optionalFunnelAnonIdSchema,
  install_id: optionalInstallIdSchema,
  verification_hypothesis: verificationHypothesisOptional,
});

export const productActivationVerifyOutcomeSchemaV3 = z.object({
  event: z.literal("verify_outcome"),
  schema_version: z.literal(3),
  run_id: z.string().min(1).max(256),
  issued_at: issuedAtSchema,
  workload_class: workloadClassSchema,
  workflow_lineage: workflowLineageSchema,
  subcommand: subcommandSchema,
  build_profile: buildProfileSchema,
  terminal_status: terminalStatusSchema,
  telemetry_source: telemetrySourceWireSchema,
  funnel_anon_id: optionalFunnelAnonIdSchema,
  install_id: optionalInstallIdSchema,
  verification_hypothesis: verificationHypothesisOptional,
});

/** @deprecated use V1/V2 schemas; kept for tests that referenced old export names */
export const productActivationVerifyStartedSchema = productActivationVerifyStartedSchemaV1;
/** @deprecated */
export const productActivationVerifyOutcomeSchema = productActivationVerifyOutcomeSchemaV1;

export const productActivationRequestSchema = z.union([
  productActivationVerifyStartedSchemaV1,
  productActivationVerifyStartedSchemaV2,
  productActivationVerifyStartedSchemaV3,
  productActivationVerifyOutcomeSchemaV1,
  productActivationVerifyOutcomeSchemaV2,
  productActivationVerifyOutcomeSchemaV3,
]);

export type ProductActivationRequest = z.infer<typeof productActivationRequestSchema>;

export { cliVersionSchema };
