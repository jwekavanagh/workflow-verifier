import { publicProductAnchors } from "@/lib/publicProductAnchors";
import type { MetadataRoute } from "next";

function abs(path: string): string {
  const base = publicProductAnchors.productionCanonicalOrigin.replace(/\/$/, "");
  return path === "" || path === "/" ? `${base}/` : `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "/",
    "/integrate",
    "/pricing",
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
