/**
 * ADOPTION_ARTIFACT_PROOF TSV in docs/adoption-validation-spec.md matches pinned registry bytes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const EXPECTED = `README.md\tmodify
artifacts/adoption-validation-verdict.json	add
docs/adoption-validation-spec.md	add
docs/first-run-validation-log.md	modify
docs/golden-path.md	add
docs/verification-product-ssot.md	modify
docs/agentskeptic.md	modify
package.json	modify
scripts/demo.mjs	add
scripts/first-run.mjs	delete
scripts/record-adoption-verdict.mjs	add
scripts/regen-truth-goldens.mjs	modify
scripts/verify-adoption-verdict.mjs	add
src/loadEvents.ts	modify
src/noStepsMessage.ts	add
src/pipeline.ts	modify
src/registryValidation.test.ts	modify
src/registryValidation.ts	modify
src/types.ts	modify
src/workflowTruthReport.semantics.test.ts	modify
src/wrongWorkflowIdAdoptionFixture.test.ts	add
test/adoption-docs-boundary.test.mjs	add
test/adoption-validation-registry.test.mjs	add
test/adoption-validation.test.mjs	add
test/cli.test.mjs	modify
test/docs-golden-path-pointer-only.test.mjs	add
test/docs-readme-no-registry-flag.test.mjs	add
test/fixtures/adoption-validation/wrong-workflow-id.events.ndjson	add
test/npm-scripts-contract.test.mjs	modify
test/pipeline.sqlite.test.mjs	modify
`;

describe("adoption validation registry", () => {
  it("adoption_validation_spec_registry_matches_plan", () => {
    const spec = readFileSync(join(root, "docs", "adoption-validation-spec.md"), "utf8");
    const m = spec.match(/```adoption-registry\r?\n([\s\S]*?)```/);
    assert.ok(m, "missing ```adoption-registry fence");
    assert.equal(m[1].replace(/\r\n/g, "\n"), EXPECTED);
  });
});
