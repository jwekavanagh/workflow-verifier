import type { NextConfig } from "next";
import path from "path";

/**
 * `outputFileTracingRoot` helps Vercel/monorepo serverless traces include the repo root.
 * On Windows + OneDrive, tracing extra roots can worsen EBUSY locks during `next build`;
 * disable locally unless deploying (set NEXT_CONFIG_TRACE_ROOT=1).
 */
const traceRoot =
  process.env.NEXT_CONFIG_TRACE_ROOT === "1"
    ? path.join(__dirname, "..")
    : undefined;

const nextConfig: NextConfig = {
  serverExternalPackages: ["nodemailer", "postgres"],
  ...(traceRoot ? { outputFileTracingRoot: traceRoot } : {}),
};

export default nextConfig;
