import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "./helpers/distributionGraphHelpers";

const DOCS_SECTION_NEEDLES: Record<string, readonly string[]> = {
  "### Route render order (copy contract)": [
    "siteTestServer",
    "getSiteHtml",
    "pricing-commercial-terms-html",
    "homepage-causality-invariant",
    "AccountLicensedStepsList",
    "database-truth-vs-traces",
  ],
  "### Integrator: server-rendered commercial and account copy": [
    "productCopy",
    "first-run-integration.md",
    "pricing",
    "account",
  ],
  "### Operator: post-change verification": ["verify:web-marketing-copy"],
  "### Ownership: discovery JSON vs productCopy.ts": [
    "discovery-acquisition.json",
    "productCopy.ts",
    "llms.txt",
  ],
  "### Marketing copy and discovery sync": [
    "sync:public-product-anchors",
    "verify:web-marketing-copy",
    "discovery-acquisition.json",
    "productCopy.ts",
  ],
};

function sectionAfterHeader(doc: string, headerLine: string): string {
  const normalized = doc.replace(/\r\n/g, "\n");
  const candidates = [`\n${headerLine}\n`, `${headerLine}\n`];
  let start = -1;
  for (const c of candidates) {
    const idx = normalized.indexOf(c);
    if (idx !== -1) {
      start = idx + c.length;
      break;
    }
  }
  if (start === -1) {
    const at = normalized.indexOf(headerLine);
    if (at === 0 || (at > 0 && normalized[at - 1] === "\n")) {
      start = at + headerLine.length;
      if (normalized[start] === "\n") start++;
    }
  }
  if (start === -1 || start > normalized.length) {
    throw new Error(`docs-marketing-contract: missing section ${headerLine}`);
  }
  const tail = normalized.slice(start);
  const next = tail.search(/\n### /);
  return next === -1 ? tail : tail.slice(0, next);
}

describe("docs marketing contract", () => {
  const root = getRepoRoot();

  it("website-product-experience mandated sections contain needles", () => {
    const doc = readFileSync(join(root, "docs", "website-product-experience.md"), "utf8");
    for (const h of [
      "### Route render order (copy contract)",
      "### Integrator: server-rendered commercial and account copy",
      "### Operator: post-change verification",
    ] as const) {
      const body = sectionAfterHeader(doc, h);
      for (const n of DOCS_SECTION_NEEDLES[h]) {
        expect(body, `website-product-experience.md § ${h} missing ${n}`).toContain(n);
      }
    }
  });

  it("public-distribution-ssot mandated section contains needles", () => {
    const doc = readFileSync(join(root, "docs", "public-distribution-ssot.md"), "utf8");
    const h = "### Ownership: discovery JSON vs productCopy.ts";
    const body = sectionAfterHeader(doc, h);
    for (const n of DOCS_SECTION_NEEDLES[h]) {
      expect(body, `public-distribution-ssot.md § ${h} missing ${n}`).toContain(n);
    }
  });

  it("CONTRIBUTING mandated section contains needles", () => {
    const doc = readFileSync(join(root, "CONTRIBUTING.md"), "utf8");
    const h = "### Marketing copy and discovery sync";
    const body = sectionAfterHeader(doc, h);
    for (const n of DOCS_SECTION_NEEDLES[h]) {
      expect(body, `CONTRIBUTING.md § ${h} missing ${n}`).toContain(n);
    }
  });
});
