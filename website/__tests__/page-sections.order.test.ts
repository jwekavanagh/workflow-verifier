import { HOME_SECTION_ORDER } from "@/app/page.sections";
import { describe, expect, it } from "vitest";

describe("HOME_SECTION_ORDER", () => {
  it("matches conversion funnel order (five sections)", () => {
    expect([...HOME_SECTION_ORDER]).toEqual([
      "hero",
      "howItWorks",
      "fitAndLimits",
      "tryIt",
      "commercialSurface",
    ]);
    expect(HOME_SECTION_ORDER.length).toBe(5);
  });

  it("orders hero through commercialSurface monotonically", () => {
    const he = HOME_SECTION_ORDER.indexOf("hero");
    const hw = HOME_SECTION_ORDER.indexOf("howItWorks");
    const fl = HOME_SECTION_ORDER.indexOf("fitAndLimits");
    const tr = HOME_SECTION_ORDER.indexOf("tryIt");
    const cs = HOME_SECTION_ORDER.indexOf("commercialSurface");
    expect(he).toBeLessThan(hw);
    expect(hw).toBeLessThan(fl);
    expect(fl).toBeLessThan(tr);
    expect(tr).toBeLessThan(cs);
  });

  it("excludes pricing", () => {
    expect(HOME_SECTION_ORDER).not.toContain("pricing");
  });
});
