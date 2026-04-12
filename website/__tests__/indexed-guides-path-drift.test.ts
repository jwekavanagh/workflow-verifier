import sitemap from "@/app/sitemap";
import discoveryAcquisition from "@/lib/discoveryAcquisition";
import { publicProductAnchors } from "@/lib/publicProductAnchors";
import { describe, expect, it } from "vitest";

describe("indexableGuides path drift", () => {
  it("sitemap guide URLs match discovery indexableGuides exactly", async () => {
    const base = publicProductAnchors.productionCanonicalOrigin.replace(/\/$/, "");
    const expected = new Set(
      discoveryAcquisition.indexableGuides.map((g) => `${base}${g.path}`),
    );
    const entries = await sitemap();
    const urls = new Set(entries.map((e) => e.url));
    for (const u of expected) {
      expect(urls.has(u)).toBe(true);
    }
    const guideUrlsInSitemap = [...urls].filter((u) =>
      discoveryAcquisition.indexableGuides.some((g) => u.endsWith(g.path)),
    );
    expect(new Set(guideUrlsInSitemap)).toEqual(expected);
  });

  it("sitemap example URLs match discovery indexableExamples exactly", async () => {
    const base = publicProductAnchors.productionCanonicalOrigin.replace(/\/$/, "");
    const expected = new Set(
      discoveryAcquisition.indexableExamples.map((e) => `${base}${e.path}`),
    );
    const entries = await sitemap();
    const urls = new Set(entries.map((e) => e.url));
    for (const u of expected) {
      expect(urls.has(u)).toBe(true);
    }
    const exampleUrlsInSitemap = [...urls].filter((u) =>
      discoveryAcquisition.indexableExamples.some((e) => u.endsWith(e.path)),
    );
    expect(new Set(exampleUrlsInSitemap)).toEqual(expected);
  });
});
