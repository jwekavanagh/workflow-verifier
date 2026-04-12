import discoveryAcquisition from "@/lib/discoveryAcquisition";
import { publicProductAnchors } from "@/lib/publicProductAnchors";
import type { MetadataRoute } from "next";

function abs(path: string): string {
  const base = publicProductAnchors.productionCanonicalOrigin.replace(/\/$/, "");
  return path === "" || path === "/" ? `${base}/` : `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const guidePaths = discoveryAcquisition.indexableGuides.map((g) => g.path);
  const examplePaths = discoveryAcquisition.indexableExamples.map((e) => e.path);
  const paths = [
    "/",
    discoveryAcquisition.slug,
    ...guidePaths,
    ...examplePaths,
    "/integrate",
    "/company",
    "/pricing",
    "/security",
    "/privacy",
    "/terms",
    "/auth/signin",
    "/openapi-commercial-v1.yaml",
    "/llms.txt",
  ];
  const now = new Date();
  return paths.map((p) => ({
    url: abs(p),
    lastModified: now,
  }));
}
