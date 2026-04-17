import { productCopy } from "@/content/productCopy";
import { describe, expect, it } from "vitest";

const EXPECTED_LEAD =
  "Open-source includes local verify and `--output-lock` without a site key. Paid adds licensed npm, API keys, reserve, quota, and CI compare/enforce—Stripe on Pricing. See docs/commercial-ssot.md (free vs paid boundary).";

describe("commercialSurface contract", () => {
  it("lead is verbatim and within max length", () => {
    expect(productCopy.commercialSurface.lead).toBe(EXPECTED_LEAD);
    expect(productCopy.commercialSurface.lead.length).toBeLessThanOrEqual(220);
  });
});
