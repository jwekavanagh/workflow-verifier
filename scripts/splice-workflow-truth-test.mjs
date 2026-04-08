import { readFileSync, writeFileSync } from "node:fs";

const p = "test/workflowTruthReport.test.mjs";
let s = readFileSync(p, "utf8");
const start = s.indexOf("const GOLDEN_COMPLETE");
const end = s.indexOf('describe("formatWorkflowTruthReport"');
if (start < 0 || end < 0) throw new Error("markers not found");
const insert = `function loadTruthGolden(name) {
  return readFileSync(join(root, "test/golden/truth-report-text", \`\${name}.txt\`), "utf8");
}

`;
s = s.slice(0, start) + insert + s.slice(end);
writeFileSync(p, s);
console.log("ok");
