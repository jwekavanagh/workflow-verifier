import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = path.resolve(__dirname, "..", "..");

describe("activation spine narrative vs shell template", () => {
  it("shell and first-run-integration.md share ordered spine through Step 4", () => {
    const shellPath = path.join(root, "scripts", "templates", "integrate-activation-shell.bash");
    const docPath = path.join(root, "docs", "first-run-integration.md");
    const shell = readFileSync(shellPath, "utf8");
    const doc = readFileSync(docPath, "utf8");

    const idxStartShell = shell.indexOf("npm start");
    const idxVerifyShell = shell.indexOf("npm run first-run-verify");
    const idxBootstrapShell = shell.indexOf("bootstrap");
    const idxWfBootShell = shell.indexOf("wf_bootstrap_fixture");
    expect(idxStartShell).toBeGreaterThanOrEqual(0);
    expect(idxVerifyShell).toBeGreaterThan(idxStartShell);
    expect(idxBootstrapShell).toBeGreaterThan(idxVerifyShell);
    expect(idxWfBootShell).toBeGreaterThan(idxBootstrapShell);

    const step1 = doc.indexOf("## Step 1:");
    const step2 = doc.indexOf("## Step 2:");
    const step3 = doc.indexOf("## Step 3:");
    const step4 = doc.indexOf("## Step 4:");
    expect(step1).toBeGreaterThanOrEqual(0);
    expect(step2).toBeGreaterThan(step1);
    expect(step3).toBeGreaterThan(step2);
    expect(step4).toBeGreaterThan(step3);

    const step1Body = doc.slice(step1, step2);
    expect(step1Body.indexOf("npm start")).toBeGreaterThanOrEqual(0);
    expect(step1Body).not.toContain("npm run first-run-verify");

    const step2Body = doc.slice(step2, step3);
    expect(step2Body.indexOf("npm run first-run-verify")).toBeGreaterThanOrEqual(0);

    const step3Body = doc.slice(step3, step4);
    expect(step3Body.indexOf("bootstrap")).toBeGreaterThanOrEqual(0);
    expect(step3Body.indexOf("wf_bootstrap_fixture")).toBeGreaterThanOrEqual(0);
    expect(step3Body.indexOf("test/fixtures/bootstrap-pack/input.json")).toBeGreaterThanOrEqual(0);

    const step2Line = doc.split(/\r?\n/).find((line) => /^##\s+Step\s+2:/i.test(line));
    expect(step2Line).toBeDefined();
    expect(step2Line!.toLowerCase()).toContain("first-run-verify");
    expect(step2Line!.toLowerCase()).not.toContain("partner-quickstart");
  });
});
