import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const PROPERTY_ACCESS_ALLOWLIST = new Set([
  "src/types.ts",
  "src/actionableFailure.ts",
  "src/operationalDisposition.ts",
  "src/workflowTruthReport.ts",
  "src/runComparison.ts",
]);

const propAccessRecommended = /\.(\s*)recommendedAction\b/;
const propAccessSafe = /\.(\s*)automationSafe\b/;

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

describe("remediationConsumptionGuard (Module C)", () => {
  it("C1: property access on recommendedAction / automationSafe is allowlisted only", () => {
    const srcDir = join(repoRoot, "src");
    for (const abs of listProductionTsFiles(srcDir)) {
      const rel = relative(repoRoot, abs).replace(/\\/g, "/");
      const text = readFileSync(abs, "utf8");
      if (propAccessRecommended.test(text) || propAccessSafe.test(text)) {
        expect(PROPERTY_ACCESS_ALLOWLIST.has(rel), rel).toBe(true);
      }
    }
  });

  it("C2: no switch on recommendedAction or automationSafe", () => {
    const srcDir = join(repoRoot, "src");
    let combined = "";
    for (const abs of listProductionTsFiles(srcDir)) {
      combined += readFileSync(abs, "utf8");
    }
    const badRec = /switch\s*\([^)]*\brecommendedAction\b/;
    const badSafe = /switch\s*\([^)]*\bautomationSafe\b/;
    expect(badRec.test(combined)).toBe(false);
    expect(badSafe.test(combined)).toBe(false);
  });

  it("C3: no remediation executor entrypoints", () => {
    const srcDir = join(repoRoot, "src");
    const exportBad =
      /^\s*export\s+(async\s+)?function\s+(remediate|executeRemediation|applyRecommendedAction|runRemediation)\b/m;
    for (const abs of listProductionTsFiles(srcDir)) {
      const bn = basename(abs);
      const badBasename =
        bn.toLowerCase() === "remediationexecutor.ts" ||
        /^execute.*remediation\.ts$/i.test(bn) ||
        /^remediation.*executor\.ts$/i.test(bn);
      expect(badBasename, bn).toBe(false);
      const text = readFileSync(abs, "utf8");
      expect(exportBad.test(text), abs).toBe(false);
    }
  });

  it("C4: core pipeline does not import remediation runners", () => {
    const fromClause = /\bfrom\s+["']([^"']+)["']/g;
    const badPath = /remediation.*exec|remediationExecutor/i;
    for (const rel of ["src/pipeline.ts", "src/cli.ts", "src/reconciler.ts"]) {
      const abs = join(repoRoot, rel);
      const text = readFileSync(abs, "utf8");
      let m: RegExpExecArray | null;
      const re = new RegExp(fromClause.source, "g");
      while ((m = re.exec(text)) !== null) {
        const spec = m[1]!;
        const leaf = basename(spec.replace(/\.(js|ts)$/, ""));
        expect(badPath.test(leaf), `${rel}: from "${spec}"`).toBe(false);
      }
    }
  });
});
