import { z } from "zod";

export const verifyOutcomeRequestSchema = z.object({
  run_id: z.string().min(1).max(256),
  terminal_status: z.enum(["complete", "inconsistent", "incomplete"]),
  workload_class: z.enum(["bundled_examples", "non_bundled"]),
  subcommand: z.enum(["batch_verify", "quick_verify", "verify_integrator_owned"]),
});

export type VerifyOutcomeRequest = z.infer<typeof verifyOutcomeRequestSchema>;
