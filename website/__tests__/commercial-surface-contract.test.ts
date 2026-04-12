import { productCopy } from "@/content/productCopy";
import { describe, expect, it } from "vitest";

const EXPECTED_LEAD =
  "Open-source lets you contract-verify from the repo without an API key; licensed npm usage, quota, and keys follow Pricing and Account. Machine-readable contracts stay on the site.";

describe("commercialSurface contract", () => {
  it("lead is verbatim and within max length", () => {
    expect(productCopy.commercialSurface.lead).toBe(EXPECTED_LEAD);
    expect(productCopy.commercialSurface.lead.length).toBeLessThanOrEqual(220);
  });
});
