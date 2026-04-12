import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("home hero contract (page.tsx source)", () => {
  const src = readFileSync(path.join(__dirname, "..", "src", "app", "page.tsx"), "utf8");

  it("hero section has exactly three link targets and required CTAs", () => {
    const sliceStart = src.indexOf("data-testid={productCopy.uiTestIds.hero}");
    expect(sliceStart).toBeGreaterThanOrEqual(0);
    const end = src.indexOf("</section>", sliceStart);
    expect(end).toBeGreaterThan(sliceStart);
    const heroSlice = src.slice(sliceStart, end);

    const linkOpens = (heroSlice.match(/<a\b/g) ?? []).length + (heroSlice.match(/<Link\b/g) ?? []).length;
    expect(linkOpens).toBe(3);

    expect(heroSlice.split('href="/pricing"').length - 1).toBe(1);
    expect(heroSlice.split('href="#try-it"').length - 1).toBe(1);
    expect(heroSlice).toContain('data-testid="home-hero-cta-row"');
    expect(heroSlice).toContain("data-testid={productCopy.homepageAcquisitionCta.testId}");
    expect(heroSlice).toContain("home-hero-grid");
    expect(heroSlice).not.toContain("<strong>What:</strong>");
    expect(heroSlice).not.toContain("<strong>Why:</strong>");
    expect(heroSlice).not.toContain("<strong>When:</strong>");
    expect(heroSlice).not.toContain('href="/integrate"');
  });
});
