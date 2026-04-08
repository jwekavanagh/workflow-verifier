import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { harvestQualifyingPathsFromPlan } from "./planTransitionPathHarvest.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const EXPECTED_HARVEST_PATH = path.join(
  repoRoot,
  "test/fixtures/plan-derived-citations/expected-harvest.json",
);

function fmFromPlanMarkdown(md: string): Record<string, unknown> {
  const rest = md.slice(3).replace(/^\r?\n/, "");
  const end = rest.search(/\n---\s*(?:\r?\n|$)/);
  const doc = YAML.parse(rest.slice(0, end));
  return doc && typeof doc === "object" && doc !== null ? (doc as Record<string, unknown>) : {};
}

describe("harvestQualifyingPathsFromPlan", () => {
  it("CORPUS: matches test/fixtures/plan-derived-citations/expected-harvest.json for all five plans", () => {
    const raw = readFileSync(EXPECTED_HARVEST_PATH, "utf8");
    const expected = JSON.parse(raw) as Record<string, string[]>;
    const keys = Object.keys(expected).sort((a, b) => a.localeCompare(b));
    expect(keys).toEqual([
      "plans/compare_and_trust_3d5ea6c8.plan.md",
      "plans/outcome_verification_107174c5.plan.md",
      "plans/partial_effects_feedback_730cddce.plan.md",
      "plans/plan-transition_validation_91ae04db.plan.md",
      "plans/verdict_audit_ec74ff93.plan.md",
    ]);
    for (const k of keys) {
      const md = readFileSync(path.join(repoRoot, k), "utf8");
      expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual(expected[k]);
    }
  });

  it("PIN_PLAN_TRANSITION_VALIDATION: plan does not harvest narrative-only rename paths", () => {
    const p = path.join(repoRoot, "plans", "plan-transition_validation_91ae04db.plan.md");
    const md = readFileSync(p, "utf8");
    const result = harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md));
    expect(result).not.toContain("src/copy.ts");
    expect(result).not.toContain("src/original.ts");
  });

  it("GOLD_OUTCOME_VERIFICATION: outcome verification plan does not harvest pipeline or reconciler citations", () => {
    const p = path.join(repoRoot, "plans", "outcome_verification_107174c5.plan.md");
    const md = readFileSync(p, "utf8");
    const result = harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md));
    expect(result).not.toContain("src/pipeline.ts");
    expect(result).not.toContain("src/reconciler.ts");
  });

  it("GOLD_COMPARE_TRUST: compare/trust plan does not harvest runComparison schema or implementation-only citations", () => {
    const p = path.join(repoRoot, "plans", "compare_and_trust_3d5ea6c8.plan.md");
    const md = readFileSync(p, "utf8");
    const result = harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md));
    expect(result).not.toContain("schemas/run-comparison-report.schema.json");
    expect(result).not.toContain("src/runComparison.ts");
  });

  it("ISO-LINK: strong-action required for links in obligation section", () => {
    const md = `---
name: x
---

## Implementation

Add [x](src/a.ts) and update [y](./schemas/b.json).
`;
    expect(harvestQualifyingPathsFromPlan(md, {})).toEqual(["schemas/b.json", "src/a.ts"]);
  });

  it("ISO-TICK: strong-action required for docs/ and examples/ backticks", () => {
    const md = `---
name: x
---

## Implementation

Add \`docs/x.md\` and extend \`examples/y.sql\`.
`;
    expect(harvestQualifyingPathsFromPlan(md, {})).toEqual(["docs/x.md", "examples/y.sql"]);
  });

  it("DELIVERABLES: harvests from ## Deliverables section", () => {
    const md = `---
name: x
todos: []
---

## Deliverables

Touch \`src/from-deliverables.ts\`.
`;
    expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual(["src/from-deliverables.ts"]);
  });

  it("ISO-TODO: extracts from todos[].content via link parser", () => {
    const md = `---
name: x
---

`;
    const fm = { todos: [{ id: "t", content: "Touch [legacy](C:/fake/prefix/src/z.ts)" }] };
    expect(harvestQualifyingPathsFromPlan(md, fm)).toEqual(["src/z.ts"]);
  });

  it("TODO-REF: semicolon segments; reference-only segment does not harvest", () => {
    const md = `---
name: x
todos:
  - id: t
    content: 'Add [a](src/a.ts); same shape as [x](src/b.ts)'
---

`;
    expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual(["src/a.ts"]);
  });

  it("does not harvest paths that appear only inside fenced code blocks in obligation section", () => {
    const md = `---
name: x
---

## Implementation

\`\`\`text
src/hidden.ts
\`\`\`

Touch \`src/visible.ts\`.
`;
    expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual(["src/visible.ts"]);
  });

  it("rejects backtick candidates with .. in path", () => {
    const md = `---
name: x
---

## Implementation

\`src/../x.ts\`
`;
    expect(harvestQualifyingPathsFromPlan(md, {})).toEqual([]);
  });

  it("does not harvest from non-obligation sections when todos empty", () => {
    const md = `---
name: x
todos: []
---

## Analysis

Touch [orphan](src/orphan.ts).
`;
    expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual([]);
  });

  it("skips reference-only lines in obligation sections", () => {
    const md = `---
name: x
---

## Testing

Like (same shape as [\`test/ref.mjs\`](c:/x/y/test/ref.mjs)) for comparison.
`;
    expect(harvestQualifyingPathsFromPlan(md, {})).toEqual([]);
  });

  it("EG_BACKTICK: e.g. before backtick path skips harvest on that line", () => {
    const md = `---
name: x
todos: []
---

## Testing

Illustrative only e.g. \`src/only-example.ts\`
`;
    expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual([]);
  });

  it("FIXTURE_PHRASE: chosen in fixture skips harvest on that line", () => {
    const md = `---
name: x
todos: []
---

## Testing

Old/new paths chosen in fixture, see \`src/fixture-example.ts\`.
`;
    expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual([]);
  });

  it("ISO-IMPL: implementation line without reference-only markers still harvests", () => {
    const md = `---
name: x
todos: []
---

## Implementation

Touch \`src/required.ts\`.
`;
    expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual(["src/required.ts"]);
  });

  it("ADV-REF: seeded-from line yields no paths", () => {
    const md = `---
name: x
todos: []
---

## Implementation

seeded from examples/seed.sql
`;
    expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual([]);
  });

  it("ADV-EXPECT: Testing section line containing Expect: yields no paths", () => {
    const md = `---
name: x
todos: []
---

## Testing

**Expect:** load from \`src/x.ts\` for the check.
`;
    expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual([]);
  });

  it("ADV-FRAG: reference-only line after obligation line does not harvest second path", () => {
    const md = `---
name: x
todos: []
---

## Implementation

Improve \`src/a.ts\`.

Same pattern as \`src/b.ts\`.
`;
    expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual(["src/a.ts"]);
  });
});
