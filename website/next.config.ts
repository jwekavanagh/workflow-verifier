import type { NextConfig } from "next";
import { createRequire } from "node:module";
import path from "path";
import { COMMERCIAL_SITE_SECURITY_HEADERS } from "./src/lib/httpSecurityHeaders";
import { DEMO_VERIFY_OUTPUT_FILE_TRACING_GLOBS } from "./src/lib/demoVerifyOutputFileTracingGlobs";

const require = createRequire(import.meta.url);
require("../scripts/public-product-anchors.cjs").assertNextPublicOriginParity();

/**
 * `outputFileTracingRoot` helps Vercel/monorepo serverless traces include the repo root.
 * On Windows + OneDrive, tracing extra roots can worsen EBUSY locks during `next build`;
 * disable locally unless deploying (set NEXT_CONFIG_TRACE_ROOT=1) or building on Vercel.
 */
const vercelLike = process.env.VERCEL === "1" || process.env.VERCEL === "production" || Boolean(process.env.VERCEL);
const traceRoot =
  vercelLike || process.env.NEXT_CONFIG_TRACE_ROOT === "1" ? path.join(__dirname, "..") : undefined;

const nextConfig: NextConfig = {
  serverExternalPackages: ["nodemailer", "postgres", "agentskeptic"],
  ...(traceRoot ? { outputFileTracingRoot: traceRoot } : {}),
  /**
   * `agentskeptic` loads JSON Schemas and the demo reads `examples/*` via runtime `readFileSync` paths
   * that file tracing cannot infer. Without these globs, Vercel serverless bundles miss the assets and
   * the route returns a non-JSON 500 (the Try-it client then shows "Network error" from `response.json()`).
   */
  outputFileTracingIncludes: {
    "/api/demo/verify": [...DEMO_VERIFY_OUTPUT_FILE_TRACING_GLOBS],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: COMMERCIAL_SITE_SECURITY_HEADERS.map((h) => ({
          key: h.key,
          value: h.value,
        })),
      },
      {
        source: "/r/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
