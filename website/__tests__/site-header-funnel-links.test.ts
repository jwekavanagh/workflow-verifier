import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("SiteHeader funnel links", () => {
  const src = readFileSync(path.join(__dirname, "..", "src", "app", "SiteHeader.tsx"), "utf8");

  it("exposes integrate, pricing, sign-in callback, account, and CLI quickstart in primary nav", () => {
    expect(src).toContain('href="/integrate"');
    expect(src).toContain('href="/pricing"');
    expect(src).toContain('href="/auth/signin?callbackUrl=%2Faccount"');
    expect(src).toContain('href="/account"');
    expect(src).toContain("href={productCopy.links.cliQuickstart}");
  });
});
