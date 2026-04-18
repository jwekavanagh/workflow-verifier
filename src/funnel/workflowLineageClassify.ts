/**
 * Machine-derived workflow lineage for product-activation telemetry (schema v3).
 * Normative semantics: docs/adoption-epistemics-ssot.md, docs/growth-metrics-ssot.md
 */

export type WorkflowLineage = "catalog_shipped" | "integrate_spine" | "integrator_scoped" | "unknown";

/** Shipped demo / partner / mid-spine workflow ids (integrate terminal uses its own bucket). */
const CATALOG_SHIPPED_WORKFLOW_IDS = new Set<string>([
  "wf_complete",
  "wf_missing",
  "wf_partner",
  "wf_bootstrap_fixture",
]);

const INTEGRATE_SPINE_WORKFLOW_ID = "wf_integrate_spine";

export type ClassifyWorkflowLineageInput =
  | {
      subcommand: "quick_verify";
      workloadClass: "bundled_examples" | "non_bundled";
    }
  | {
      subcommand: "batch_verify";
      workloadClass: "bundled_examples" | "non_bundled";
      workflowId: string | undefined;
    };

/**
 * Deterministic lineage for funnel L2 proxy. Does not prove ProductionComplete or A4 attestation.
 */
export function classifyWorkflowLineage(input: ClassifyWorkflowLineageInput): WorkflowLineage {
  if (input.subcommand === "quick_verify") {
    return input.workloadClass === "bundled_examples" ? "catalog_shipped" : "integrator_scoped";
  }
  const wf = input.workflowId?.trim();
  if (!wf) return "unknown";
  if (wf === INTEGRATE_SPINE_WORKFLOW_ID) return "integrate_spine";
  if (CATALOG_SHIPPED_WORKFLOW_IDS.has(wf)) return "catalog_shipped";
  return "integrator_scoped";
}
