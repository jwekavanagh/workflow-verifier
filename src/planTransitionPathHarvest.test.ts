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
  "src/pipeline.ts",
  "src/reconciler.ts",
  "src/schemaLoad.ts",
  "src/verificationAgainstSystemState.requirements.test.ts",
  "test/pipeline.sqlite.test.mjs",
];

const GOLDEN_SLICE_6 = [
  "debug-ui/app.js",
  "docs/execution-truth-layer.md",
  "examples/seed.sql",
  "examples/tools.json",
  "schemas/run-comparison-report.schema.json",
  "src/debugPanels.test.ts",
  "src/debugPanels.ts",
  "src/debugServer.test.ts",
  "src/debugServer.ts",
  "src/runComparison.ts",
  "src/slice6.compare.ac.test.ts",
  "src/verificationAgainstSystemState.requirements.test.ts",
  "test/debug-ui/ac-10-3.spec.ts",
  "test/debug-ui/ac-10-4.spec.ts",
  "test/debug-ui/ac-9-3.spec.ts",
  "test/fixtures/debug-ui-slice6/expected-strings.json",
  "test/fixtures/debug-ui-slice6/headline-ac-9-4.json",
];

describe("harvestQualifyingPathsFromPlan", () => {
  it("ISO-LINK: extracts only from markdown link targets", () => {
    const md = `---
name: x
---

See [x](src/a.ts) and [y](./schemas/b.json).
`;
    expect(harvestQualifyingPathsFromPlan(md, {})).toEqual(["schemas/b.json", "src/a.ts"]);
  });

  it("ISO-TICK: extracts only from inline backticks", () => {
    const md = `---
name: x
---

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

  it("does not harvest paths that appear only inside fenced code blocks", () => {
    const md = `---
name: x
---

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

\`src/../x.ts\`
`;
    expect(harvestQualifyingPathsFromPlan(md, {})).toEqual([]);
  });

  it("GOLD-S2: slice_2 plan matches pinned array", () => {
    const p = path.join(repoRoot, "plans", "slice_2_outcome_verification_107174c5.plan.md");
    const md = readFileSync(p, "utf8");
    expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual(GOLDEN_SLICE_2);
  });

  it("GOLD-S6: slice_6 plan matches pinned array", () => {
    const p = path.join(repoRoot, "plans", "slice_6_compare_and_trust_3d5ea6c8.plan.md");
    const md = readFileSync(p, "utf8");
    expect(harvestQualifyingPathsFromPlan(md, fmFromPlanMarkdown(md))).toEqual(GOLDEN_SLICE_6);
  });
});
