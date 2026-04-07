import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { harvestQualifyingPathsFromPlan } from "./planTransitionPathHarvest.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function fmFromPlanMarkdown(md: string): Record<string, unknown> {
  const rest = md.slice(3).replace(/^\r?\n/, "");
  const end = rest.search(/\n---\s*(?:\r?\n|$)/);
  const doc = YAML.parse(rest.slice(0, end));
  return doc && typeof doc === "object" && doc !== null ? (doc as Record<string, unknown>) : {};
}

const GOLDEN_SLICE_2 = [
  "docs/execution-truth-layer.md",
  "examples/seed.sql",
  "schemas/workflow-result.schema.json",
  "src/schemaLoad.ts",
  "src/verificationAgainstSystemState.requirements.test.ts",
];

const GOLDEN_SLICE_6 = [
  "debug-ui/app.js",
  "docs/execution-truth-layer.md",
  "examples/seed.sql",
  "examples/tools.json",
  "src/debugPanels.test.ts",
  "src/debugPanels.ts",
  "src/debugServer.test.ts",
  "src/slice6.compare.ac.test.ts",
  "src/verificationAgainstSystemState.requirements.test.ts",
  "test/debug-ui/ac-10-3.spec.ts",
  "test/debug-ui/ac-10-4.spec.ts",
  "test/debug-ui/ac-9-3.spec.ts",
  "test/fixtures/debug-ui-slice6/expected-strings.json",
  "test/fixtures/debug-ui-slice6/headline-ac-9-4.json",
];

describe("harvestQualifyingPathsFromPlan", () => {
  it("ISO-LINK: extracts only from markdown link targets in obligation section", () => {
    const md = `---
name: x
---

## Implementation

See [x](src/a.ts) and [y](./schemas/b.json).
`;
    expect(harvestQualifyingPathsFromPlan(md, {})).toEqual(["schemas/b.json", "src/a.ts"]);
  });

  it("ISO-TICK: extracts only from inline backticks in obligation section", () => {
    const md = `---
name: x
---

## Implementation

Use \`docs/x.md\` and \`examples/y.sql\`.
`;
    expect(harvestQualifyingPathsFromPlan(md, {})).toEqual(["docs/x.md", "examples/y.sql"]);
  });

  it("ISO-TODO: extracts from todos[].content via link parser", () => {
    const md = `---
name: x
---

`;
    const fm = { todos: [{ id: "t", content: "Touch [legacy](C:/fake/prefix/src/z.ts)" }] };
    expect(harvestQualifyingPathsFromPlan(md, fm)).toEqual(["src/z.ts"]);
  });

  it("TODO-REF: reference-only phrase in todo content still harvests paths (no reference filter on todos)", () => {
    const md = `---
name: x
todos:
  - id: t
    content: 'same shape as [x](src/from-todo.ts)'
---

`;
    expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual(["src/from-todo.ts"]);
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

  const PIN_SLICE_PLAN_EXPECTED = [
    "docs/execution-truth-layer.md",
    "schemas/plan-validation-frontmatter.schema.json",
    "src/cli.ts",
    "src/index.ts",
    "src/planTransition.ts",
    "src/schemaLoad.ts",
  ];

  it("PIN_SLICE_PLAN: plan-transition_validation slice harvest matches deliverables only", () => {
    const p = path.join(repoRoot, "plans", "plan-transition_validation_slice_91ae04db.plan.md");
    const md = readFileSync(p, "utf8");
    const result = harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md));
    expect(result).toEqual(PIN_SLICE_PLAN_EXPECTED);
    expect(result).not.toContain("src/copy.ts");
    expect(result).not.toContain("src/original.ts");
  });

  it("GOLD-S2: slice_2 plan matches pinned array", () => {
    const p = path.join(repoRoot, "plans", "slice_2_outcome_verification_107174c5.plan.md");
    const md = readFileSync(p, "utf8");
    const result = harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md));
    expect(result).toEqual(GOLDEN_SLICE_2);
    expect(result).not.toContain("src/pipeline.ts");
    expect(result).not.toContain("src/reconciler.ts");
  });

  it("GOLD-S6: slice_6 plan matches pinned array", () => {
    const p = path.join(repoRoot, "plans", "slice_6_compare_and_trust_3d5ea6c8.plan.md");
    const md = readFileSync(p, "utf8");
    const result = harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md));
    expect(result).toEqual(GOLDEN_SLICE_6);
    expect(result).not.toContain("schemas/run-comparison-report.schema.json");
    expect(result).not.toContain("src/runComparison.ts");
  });
});
