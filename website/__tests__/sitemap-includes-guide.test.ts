import sitemap from "@/app/sitemap";
import discoveryAcquisition from "@/lib/discoveryAcquisition";
import { publicProductAnchors } from "@/lib/publicProductAnchors";
import { describe, expect, it } from "vitest";

describe("sitemap", () => {
  it("includes every indexable guide path and /security; omits /guides hub", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    const base = publicProductAnchors.productionCanonicalOrigin.replace(/\/$/, "");
    for (const g of discoveryAcquisition.indexableGuides) {
      expect(urls.some((u) => u === `${base}${g.path}`)).toBe(true);
    }
    for (const e of discoveryAcquisition.indexableExamples) {
      expect(urls.some((u) => u === `${base}${e.path}`)).toBe(true);
    }
    expect(urls.some((u) => u.endsWith("/security"))).toBe(true);
    expect(urls).not.toContain(`${base}/guides`);
    expect(urls).not.toContain(`${base}/examples`);
  });
});
