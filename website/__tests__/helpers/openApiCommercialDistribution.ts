/** Shared assertions for OpenAPI commercial distribution shape (derived disk vs served YAML) to prevent drift between openapi-commercial.contract and distribution-graph tests. */
import { expect } from "vitest";
import type { PublicProductAnchors } from "./distributionGraphHelpers";

export function assertDerivedOpenApiCommercialDistribution(
  doc: Record<string, unknown>,
  ctx: { anchors: PublicProductAnchors; normalize: (s: string) => string },
): void {
  expect(doc.openapi).toBe("3.0.3");
  const ext = doc.externalDocs as { description?: string; url?: string };
  expect(ext.description).toBe("First-run integration guide");
  const info = doc.info as Record<string, unknown>;
  expect("externalDocs" in info).toBe(false);
  const { anchors, normalize } = ctx;
  const canonicalOrigin = normalize(anchors.productionCanonicalOrigin);
  const integrateUrl = `${canonicalOrigin}/integrate`;
  expect(normalize(String(ext.url))).toBe(normalize(integrateUrl));
  expect(normalize(String((info.contact as { url: string }).url))).toBe(canonicalOrigin);
  const dist = info["x-agentskeptic-distribution"] as Record<string, string>;
  const distHostOpenApi = `${canonicalOrigin}/openapi-commercial-v1.yaml`;
  expect(Object.keys(dist).sort()).toEqual(["npmPackage", "openApi", "repository"]);
  expect(String(dist.repository)).toBe(anchors.gitRepositoryUrl);
  expect(String(dist.npmPackage)).toBe(anchors.npmPackageUrl);
  expect(normalize(String(dist.openApi))).toBe(normalize(distHostOpenApi));
}

export function assertServedOpenApiCommercialDistribution(
  doc: Record<string, unknown>,
  yamlText: string,
  ctx: {
    anchors: PublicProductAnchors;
    normalize: (s: string) => string;
    canonicalOrigin: string;
    serversOriginForUrlLine: string;
    escapeRegExp: (s: string) => string;
  },
): void {
  const { anchors, normalize, canonicalOrigin, serversOriginForUrlLine, escapeRegExp } = ctx;
  expect(doc.openapi).toBe("3.0.3");
  expect("externalDocs" in doc).toBe(true);
  const ext = doc.externalDocs as { description?: string; url?: string };
  expect(ext.description).toBe("First-run integration guide");
  const info = doc.info as Record<string, unknown>;
  expect("externalDocs" in info).toBe(false);
  const integrateUrl = `${canonicalOrigin}/integrate`;
  expect(normalize(String(ext.url))).toBe(normalize(integrateUrl));
  expect(normalize(String((info.contact as { url: string }).url))).toBe(canonicalOrigin);
  expect(new RegExp("^\\s*url:\\s*" + escapeRegExp(serversOriginForUrlLine) + "\\s*$", "m").test(yamlText)).toBe(
    true,
  );
  expect(yamlText.includes("example.invalid")).toBe(false);
  const dist = info["x-agentskeptic-distribution"] as Record<string, string>;
  expect(Object.keys(dist).sort()).toEqual(["npmPackage", "openApi", "repository"]);
  expect(String(dist.repository)).toBe(anchors.gitRepositoryUrl);
  expect(String(dist.npmPackage)).toBe(anchors.npmPackageUrl);
  const selfServed = `${serversOriginForUrlLine}/openapi-commercial-v1.yaml`;
  expect(normalize(String(dist.openApi))).toBe(normalize(selfServed));
}
