import { HOME_SECTION_ORDER } from "@/app/page.sections";
import { describe, expect, it } from "vitest";

describe("HOME_SECTION_ORDER", () => {
  it("matches conversion funnel order (six sections)", () => {
    expect([...HOME_SECTION_ORDER]).toEqual([
      "hero",
      "homeTrustStrip",
      "howItWorks",
      "fitAndLimits",
      "tryIt",
      "commercialSurface",
    ]);
    expect(HOME_SECTION_ORDER.length).toBe(6);
  });

  it("orders hero through commercialSurface monotonically", () => {
    const he = HOME_SECTION_ORDER.indexOf("hero");
    const ts = HOME_SECTION_ORDER.indexOf("homeTrustStrip");
    const hw = HOME_SECTION_ORDER.indexOf("howItWorks");
    const fl = HOME_SECTION_ORDER.indexOf("fitAndLimits");
    const tr = HOME_SECTION_ORDER.indexOf("tryIt");
    const cs = HOME_SECTION_ORDER.indexOf("commercialSurface");
    expect(he).toBeLessThan(ts);
    expect(ts).toBeLessThan(hw);
    expect(hw).toBeLessThan(fl);
    expect(fl).toBeLessThan(tr);
    expect(tr).toBeLessThan(cs);
  });

  it("excludes pricing", () => {
    expect(HOME_SECTION_ORDER).not.toContain("pricing");
  });
});
