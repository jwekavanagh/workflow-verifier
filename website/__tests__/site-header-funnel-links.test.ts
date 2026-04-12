import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("SiteHeader funnel links", () => {
  const src = readFileSync(path.join(__dirname, "..", "src", "app", "SiteHeader.tsx"), "utf8");
  const siteChromeSrc = readFileSync(path.join(__dirname, "..", "src", "lib", "siteChrome.ts"), "utf8");

  it("exposes guides, acquisition, integrate, pricing, sign-in callback, account, sign-out, and CLI quickstart in primary nav", () => {
    expect(src).toContain("buildSiteHeaderPrimaryLinks");
    expect(siteChromeSrc).toContain('href: "/guides"');
    expect(src).toContain("href={productCopy.homepageAcquisitionCta.href}");
    expect(src).toContain("{discoveryAcquisition.homepageAcquisitionCtaLabel}");
    expect(siteChromeSrc).toContain('href: "/integrate"');
    expect(siteChromeSrc).toContain('href: "/pricing"');
    expect(src).toContain('href="/auth/signin?callbackUrl=%2Faccount"');
    expect(src).toContain('href="/account"');
    expect(src).toContain("SignOutButton");
    expect(src).toContain("href={productCopy.links.cliQuickstart}");
  });
});
