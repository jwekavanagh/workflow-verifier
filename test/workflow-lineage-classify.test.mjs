import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("classifyWorkflowLineage", () => {
  it("classifies quick bundled vs non_bundled", async () => {
    const { classifyWorkflowLineage } = await import("../dist/funnel/workflowLineageClassify.js");
    assert.equal(
      classifyWorkflowLineage({ subcommand: "quick_verify", workloadClass: "bundled_examples" }),
      "catalog_shipped",
    );
    assert.equal(
      classifyWorkflowLineage({ subcommand: "quick_verify", workloadClass: "non_bundled" }),
      "integrator_scoped",
    );
  });

  it("classifies batch shipped, spine, integrator, unknown", async () => {
    const { classifyWorkflowLineage } = await import("../dist/funnel/workflowLineageClassify.js");
    const b = (workflowId, workloadClass = "non_bundled") =>
      classifyWorkflowLineage({ subcommand: "batch_verify", workloadClass, workflowId });

    assert.equal(b("wf_complete"), "catalog_shipped");
    assert.equal(b("wf_missing"), "catalog_shipped");
    assert.equal(b("wf_partner"), "catalog_shipped");
    assert.equal(b("wf_bootstrap_fixture"), "catalog_shipped");
    assert.equal(b("wf_integrate_spine"), "integrate_spine");
    assert.equal(b("wf_custom_integrator"), "integrator_scoped");
    assert.equal(b(""), "unknown");
    assert.equal(b(undefined), "unknown");
    assert.equal(b("  "), "unknown");
  });
});
