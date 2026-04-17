import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = path.resolve(__dirname, "..", "..");

describe("activation spine narrative vs shell template", () => {
  it("first-run-integration.md and integrate-activation-shell share npm start then npm run first-run-verify; Step 2 heading names first-run-verify only", () => {
    const shellPath = path.join(root, "scripts", "templates", "integrate-activation-shell.bash");
    const docPath = path.join(root, "docs", "first-run-integration.md");
    const shell = readFileSync(shellPath, "utf8");
    const doc = readFileSync(docPath, "utf8");

    const idxStartShell = shell.indexOf("npm start");
    const idxVerifyShell = shell.indexOf("npm run first-run-verify");
    expect(idxStartShell).toBeGreaterThanOrEqual(0);
    expect(idxVerifyShell).toBeGreaterThan(idxStartShell);

    const step1 = doc.indexOf("## Step 1:");
    const step2 = doc.indexOf("## Step 2:");
    expect(step1).toBeGreaterThanOrEqual(0);
    expect(step2).toBeGreaterThan(step1);
    const step1Body = doc.slice(step1, step2);
    expect(step1Body.indexOf("npm start")).toBeGreaterThanOrEqual(0);
    expect(step1Body).not.toContain("npm run first-run-verify");
    const step2Body = doc.slice(step2);
    expect(step2Body.indexOf("npm run first-run-verify")).toBeGreaterThanOrEqual(0);

    const step2Line = doc.split(/\r?\n/).find((line) => /^##\s+Step\s+2:/i.test(line));
    expect(step2Line).toBeDefined();
    expect(step2Line!.toLowerCase()).toContain("first-run-verify");
    expect(step2Line!.toLowerCase()).not.toContain("partner-quickstart");
  });
});
