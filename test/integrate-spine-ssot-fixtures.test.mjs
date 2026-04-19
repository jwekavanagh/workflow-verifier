/**
 * Pinned SSOT fragments for IntegrateSpineComplete + verify-integrator-owned terminal.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

describe("integrate spine SSOT golden fixtures", () => {
  it("first_run_integration_contains_pinned_integratespine_block", () => {
    const doc = readFileSync(join(root, "docs", "first-run-integration.md"), "utf8");
    const pinned = readFileSync(join(root, "test", "fixtures", "integrate-spine-ssot-first-run-pinned.txt"), "utf8").trim();
    assert.ok(doc.includes(pinned), "first-run-integration.md must contain pinned IntegrateSpineComplete bullet");
  });

  it("adoption_epistemics_contains_pinned_integratespine_row", () => {
    const doc = readFileSync(join(root, "docs", "adoption-epistemics-ssot.md"), "utf8");
    const pinned = readFileSync(join(root, "test", "fixtures", "integrate-spine-ssot-adoption-row-pinned.txt"), "utf8").trim();
    assert.ok(doc.includes(pinned), "adoption-epistemics-ssot.md must contain pinned four-way table row");
  });
});
