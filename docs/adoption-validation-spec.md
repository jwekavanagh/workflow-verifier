# Adoption validation specification

This document defines how the repository proves the **adoption golden path**: demo wrapper constraints, batch CLI parity, enriched `NO_STEPS_FOR_WORKFLOW` diagnostics, documentation boundaries, and the pinned `npm test` chain.

## Validation proofs

| Id | Proof |
|----|--------|
| WRAPPER_IO | `demo_script_has_no_success_path_console_io` — asserts demo script has zero forbidden success-path I/O substrings and exactly one `console.error(` |
| BATCH_COMPLETE | `cli_wf_complete_batch_contract` |
| BATCH_MISSING | `cli_wf_missing_batch_contract` |
| NO_STEPS_STDOUT | `no_steps_message_matches_template_for_wrong_workflow_id_fixture` |
| NO_STEPS_STDERR | `no_steps_human_stderr_contains_full_message` |
| README_SCOPE | `docs-readme-no-registry-flag.test.mjs` |
| DOC_BOUNDARY | `adoption-docs-boundary.test.mjs` |
| GOLDEN_PATH_POINTERS | `docs-golden-path-pointer-only.test.mjs` |
| ARTIFACT_REGISTRY | `adoption_validation_spec_registry_matches_plan` |
| VERDICT | `npm test` runs `npm run build`, Vitest, pinned SQLite `node:test`, `node scripts/first-run.mjs`, `node examples/minimal-ci-enforcement/run.mjs`, `node dist/cli.js assurance run --manifest examples/assurance/manifest.json`, and `npm run validate-ttfv` — **no** Postgres |
| REGISTRY_NO_STEPS | `src/registryValidation.test.ts` |

## ADOPTION_ARTIFACT_PROOF (registry TSV)

Canonical registry: exactly **31** data rows (`relpath<TAB>op`), UTF-16 lexicographic order on `relpath`, no header row.

```adoption-registry
README.md	modify
artifacts/adoption-validation-verdict.json	add
docs/adoption-validation-spec.md	add
docs/first-run-validation-log.md	modify
docs/golden-path.md	add
docs/verification-product-ssot.md	modify
docs/workflow-verifier.md	modify
package.json	modify
scripts/demo.mjs	add
scripts/first-run.mjs	delete
scripts/record-adoption-verdict.mjs	add
scripts/regen-truth-goldens.mjs	modify
scripts/verify-adoption-verdict.mjs	add
src/loadEvents.eventFileAggregateCounts.test.ts	add
src/loadEvents.ts	modify
src/noStepsMessage.test.ts	add
src/noStepsMessage.ts	add
src/pipeline.ts	modify
src/registryValidation.test.ts	modify
src/registryValidation.ts	modify
src/types.ts	modify
src/workflowTruthReport.semantics.test.ts	modify
test/adoption-docs-boundary.test.mjs	add
test/adoption-validation-registry.test.mjs	add
test/adoption-validation.test.mjs	add
test/cli.test.mjs	modify
test/docs-golden-path-pointer-only.test.mjs	add
test/docs-readme-no-registry-flag.test.mjs	add
test/fixtures/adoption-validation/wrong-workflow-id.events.ndjson	add
test/npm-scripts-contract.test.mjs	modify
test/pipeline.sqlite.test.mjs	modify
```

After a successful `npm test`, that chain (see VERDICT row) has exercised the onboarding smoke (`scripts/first-run.mjs`), the minimal CI enforcement example, `assurance run` against `examples/assurance/manifest.json`, and TTFV validation. Optional legacy scripts `scripts/record-adoption-verdict.mjs` and `scripts/verify-adoption-verdict.mjs` can still record `artifacts/adoption-validation-verdict.json` manually; they are **not** invoked by the default `npm test` script.
