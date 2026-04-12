import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { readCommercialPricingLines } from "./lib/readCommercialPricingLines.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const productCopyPath = path.join(root, "website", "src", "content", "productCopy.ts");
const pricingPagePath = path.join(root, "website", "src", "app", "pricing", "page.tsx");

describe("commercial pricing policy parity", () => {
  it("server pricing surface (productCopy + pricing page) contains both normative lines from policy", () => {
    const lines = readCommercialPricingLines(root);
    const combined =
      readFileSync(productCopyPath, "utf8") + readFileSync(pricingPagePath, "utf8");
    for (const line of lines) {
      assert.ok(
        combined.includes(line),
        `pricing policy line must appear in productCopy.ts and/or pricing/page.tsx: ${line.slice(0, 60)}…`,
      );
    }
    assert.ok(
      combined.includes("pricingCommercialTermsBullets"),
      "pricing/page.tsx must render pricingCommercialTermsBullets (server commercial terms)",
    );
    assert.ok(
      combined.includes('aria-label="Commercial terms"'),
      "pricing/page.tsx must expose the Commercial terms list to HTML",
    );
  });
});
