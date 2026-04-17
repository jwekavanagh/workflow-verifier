import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { getRepoRoot, loadAnchors } from "./helpers/distributionGraphHelpers";
import { assertDerivedOpenApiCommercialDistribution } from "./helpers/openApiCommercialDistribution";

const require = createRequire(import.meta.url);
const { normalize } = require("../../scripts/public-product-anchors.cjs") as {
  normalize: (s: string) => string;
};

const TOKENS = [
  "__IDENTITY_ONE_LINER__",
  "__DISTRIBUTION_CONTACT_URL__",
  "__DISTRIBUTION_INTEGRATE_URL__",
  "__DISTRIBUTION_REPO_URL__",
  "__DISTRIBUTION_NPM_URL__",
  "__OPENAPI_SELF_URL__",
  "__SERVERS_ORIGIN__",
] as const;

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = 0;
  while (true) {
    const j = haystack.indexOf(needle, i);
    if (j === -1) break;
    n++;
    i = j + needle.length;
  }
  return n;
}

describe("openapi-commercial contract", () => {
  const root = getRepoRoot();
  const inPath = join(root, "schemas", "openapi-commercial-v1.in.yaml");
  const derivedPath = join(root, "schemas", "openapi-commercial-v1.yaml");

  it("template has exactly one of each token; docIn header literals and shape", () => {
    const inYaml = readFileSync(inPath, "utf8");
    for (const tok of TOKENS) {
      expect(countOccurrences(inYaml, tok)).toBe(1);
    }
    const docIn = parse(inYaml) as Record<string, unknown>;
    expect(docIn.openapi).toBe("3.0.3");
    const extIn = docIn.externalDocs as { description?: string };
    expect(extIn.description).toBe("First-run integration guide");
    const infoIn = docIn.info as Record<string, unknown>;
    expect("externalDocs" in infoIn).toBe(false);
  });

  it("derived YAML has no template tokens; docDerived matches distribution contract", () => {
    const derived = readFileSync(derivedPath, "utf8");
    for (const tok of TOKENS) {
      expect(derived.includes(tok)).toBe(false);
    }
    const anchors = loadAnchors();
    const docDerived = parse(derived) as Record<string, unknown>;
    assertDerivedOpenApiCommercialDistribution(docDerived, { anchors, normalize });
  });

  it("lists reserve, plans, and public verification-report paths matching implemented routes", () => {
    const t = readFileSync(derivedPath, "utf8");
    expect(t).toContain("/api/v1/usage/reserve");
    expect(t).toContain("/api/v1/commercial/plans");
    expect(t).toContain("/api/public/verification-reports");
    expect(t).toContain("createPublicVerificationReport");
    expect(t).toContain("reserveUsage");
    expect(t).toContain("getCommercialPlans");
    expect(t).toContain("VERIFICATION_REQUIRES_SUBSCRIPTION");
    expect(t).toContain("BILLING_PRICE_UNMAPPED");
    expect(t).toMatch(/enum:\s*\[starter,\s*individual,\s*team,\s*business,\s*enterprise\]/);
  });
});
