/**
 * Enforces npm script shape for post-audit single-gate CI (package.json only).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function countValidateTtfv(s) {
  return (s.match(/validate-ttfv/g) || []).length;
}

describe("npm scripts contract (test / test:ci)", () => {
  it("scripts.test contains exactly one validate-ttfv token", () => {
    assert.equal(countValidateTtfv(pkg.scripts.test), 1);
  });

  it("scripts.test:ci contains exactly one validate-ttfv token", () => {
    assert.equal(countValidateTtfv(pkg.scripts["test:ci"]), 1);
  });

  it("scripts.test must not reference removed quick-verify-contract or quick-verify-sql-allowlist", () => {
    assert.equal(pkg.scripts.test.includes("quick-verify-contract"), false);
    assert.equal(pkg.scripts.test.includes("quick-verify-sql-allowlist"), false);
  });

  it("scripts.test:ci must not reference removed scripts", () => {
    assert.equal(pkg.scripts["test:ci"].includes("quick-verify-contract"), false);
    assert.equal(pkg.scripts["test:ci"].includes("quick-verify-sql-allowlist"), false);
  });

  it("test:ci must not run first-run demo", () => {
    assert.equal(pkg.scripts["test:ci"].includes("first-run"), false);
  });

  it("test must still run first-run for local onboarding smoke", () => {
    assert.equal(pkg.scripts.test.includes("first-run"), true);
  });
});
