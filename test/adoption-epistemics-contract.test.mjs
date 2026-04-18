/**
 * ADOPTION_EPISTEMICS_CONTRACT — commercial verdict shape and anchor SSOT links.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const ANCHOR_DOCS = [
  "docs/funnel-observability-ssot.md",
  "docs/growth-metrics-ssot.md",
  "docs/commercial-ssot.md",
  "docs/first-run-integration.md",
  "docs/golden-path.md",
  "docs/verification-product-ssot.md",
];

const LINK = "adoption-epistemics-ssot.md";

describe("adoption epistemics contract", () => {
  it("commercial_validation_verdict_layers_shape", () => {
    const raw = readFileSync(join(root, "artifacts", "commercial-validation-verdict.json"), "utf8");
    const v = JSON.parse(raw);
    assert.equal(v.schemaVersion, 1);
    assert.ok(v.layers && typeof v.layers === "object");
    assert.ok("regression" in v.layers);
    assert.ok("playwrightCommercialE2e" in v.layers);
    assert.equal("funnel" in v.layers, false);
    assert.equal(typeof v.layers.regression, "boolean");
    assert.equal(typeof v.layers.playwrightCommercialE2e, "boolean");
  });

  it("anchor_docs_link_adoption_epistemics_ssot", () => {
    for (const rel of ANCHOR_DOCS) {
      const body = readFileSync(join(root, rel), "utf8");
      assert.ok(
        body.includes(LINK),
        `${rel} must link to ${LINK}`,
      );
    }
  });

  it("adoption_epistemics_structural_throughput_constraint_section", () => {
    const body = readFileSync(join(root, "docs", "adoption-epistemics-ssot.md"), "utf8");
    const heading = "## Structural throughput constraint";
    assert.equal(
      body.split(heading).length - 1,
      1,
      "exactly one ## Structural throughput constraint heading",
    );
    assert.equal(
      body.split("## Structural vs empirical vs telemetry proxies").length - 1,
      1,
      "exactly one ## Structural vs empirical vs telemetry proxies heading",
    );
    for (const s of ["integrator-owned", "correctly-shaped", "cannot be ranked from this repository"]) {
      assert.ok(body.includes(s), `docs/adoption-epistemics-ssot.md must contain ${JSON.stringify(s)}`);
    }
    assert.ok(
      body.includes("**Dominant real-world drop-off:**"),
      "dominant drop-off subsection must remain for epistemic clarity",
    );
  });

  it("cross_doc_links_to_structural_throughput_constraint_fragment", () => {
    const frag = "adoption-epistemics-ssot.md#structural-throughput-constraint";
    for (const rel of ["docs/first-run-integration.md", "docs/growth-metrics-ssot.md"]) {
      const body = readFileSync(join(root, rel), "utf8");
      assert.ok(body.includes(frag), `${rel} must include link fragment ${frag}`);
    }
    const vp = readFileSync(join(root, "docs", "verification-product-ssot.md"), "utf8");
    assert.ok(
      vp.includes("Structural throughput constraint"),
      "verification-product SSOT authority matrix must name Structural throughput constraint",
    );
  });
});
