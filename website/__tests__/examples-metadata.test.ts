import { describe, expect, it } from "vitest";
import { metadata } from "@/app/examples/page";
import { productCopy } from "@/content/productCopy";

/** Must not appear in index `description` (reserved for robots directive wording, not organic copy). */
const EXAMPLES_INDEX_DESCRIPTION_FORBIDDEN_SUBSTRING = "noindex";

describe("examples index metadata", () => {
  it("uses productCopy.examplesIndexDescription without forbidden substring", () => {
    const desc = metadata.description;
    expect(desc).toBe(productCopy.examplesIndexDescription);
    expect(String(desc).toLowerCase()).not.toContain(EXAMPLES_INDEX_DESCRIPTION_FORBIDDEN_SUBSTRING);
  });
});
