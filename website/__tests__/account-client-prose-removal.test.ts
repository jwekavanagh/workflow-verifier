import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** ≥48 chars from licensing prose removed from AccountClient (must not return in client bundle). */
const REMOVED_ACCOUNT_LICENSE_SNIPPET =
  "Each licensed run must succeed license reserve—your API key alone does not grant verification until subscription";

describe("AccountClient licensing prose removal", () => {
  it("does not ship removed licensing paragraph in AccountClient source", () => {
    const p = join(__dirname, "..", "src", "app", "account", "AccountClient.tsx");
    const src = readFileSync(p, "utf8");
    expect(REMOVED_ACCOUNT_LICENSE_SNIPPET.length).toBeGreaterThanOrEqual(48);
    expect(src).not.toContain(REMOVED_ACCOUNT_LICENSE_SNIPPET);
  });
});
