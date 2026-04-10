import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("home next steps links", () => {
  const src = readFileSync(path.join(__dirname, "..", "src", "app", "page.tsx"), "utf8");

  it("includes integrate, pricing, sign-in with callback, and CLI quickstart", () => {
    expect(src).toContain('href="/integrate"');
    expect(src).toContain('href="/pricing"');
    expect(src).toContain('/auth/signin?callbackUrl=%2Faccount');
    expect(src).toContain("productCopy.links.cliQuickstart");
  });
});
