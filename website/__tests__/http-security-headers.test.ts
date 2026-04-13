import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_SITE_CONTENT_SECURITY_POLICY,
  COMMERCIAL_SITE_SECURITY_HEADERS,
} from "@/lib/httpSecurityHeaders";

describe("httpSecurityHeaders", () => {
  it("exports the frozen CSP string", () => {
    expect(COMMERCIAL_SITE_CONTENT_SECURITY_POLICY).toBe(
      "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com; connect-src 'self' https://vitals.vercel-insights.com https://va.vercel-scripts.com; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:;",
    );
  });

  it("exports headers in fixed order with exact key/value pairs", () => {
    expect(COMMERCIAL_SITE_SECURITY_HEADERS).toEqual([
      { key: "Content-Security-Policy", value: COMMERCIAL_SITE_CONTENT_SECURITY_POLICY },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ]);
  });
});
