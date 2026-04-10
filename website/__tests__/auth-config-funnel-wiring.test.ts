import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("auth.config funnel wiring", () => {
  it("registers events.signIn calling recordSignInFunnel", () => {
    const src = readFileSync(path.join(__dirname, "..", "src", "auth.config.ts"), "utf8");
    expect(src).toContain("events:");
    expect(src).toContain("signIn");
    expect(src).toContain("recordSignInFunnel");
  });
});
