import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const ALLOWLIST = new Set([
  "src/types.ts",
  "src/actionableFailure.ts",
  "src/operationalDisposition.ts",
  "src/workflowTruthReport.ts",
  "src/runComparison.ts",
]);

function listProductionTsFiles(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      listProductionTsFiles(p, out);
    } else if (ent.isFile() && ent.name.endsWith(".ts") && !ent.name.endsWith(".test.ts")) {
      out.push(p);
    }
  }
  return out;
}

describe("remediationWireSurfaceGuard (Module B)", () => {
  it("only allowlisted src/**/*.ts (non-test) may contain the identifier recommendedAction", () => {
    const srcDir = join(repoRoot, "src");
    for (const abs of listProductionTsFiles(srcDir)) {
      const rel = relative(repoRoot, abs).replace(/\\/g, "/");
      const text = readFileSync(abs, "utf8");
      if (!text.includes("recommendedAction")) continue;
      expect(ALLOWLIST.has(rel), rel).toBe(true);
    }
  });
});
