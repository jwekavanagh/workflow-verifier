import { publicProductAnchors } from "@/lib/publicProductAnchors";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = publicProductAnchors.productionCanonicalOrigin.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
