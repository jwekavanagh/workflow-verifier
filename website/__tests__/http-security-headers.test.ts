import { describe, expect, it } from "vitest";
import {
  buildCommercialSiteContentSecurityPolicy,
  COMMERCIAL_SITE_CSP_NONCE_HEADER,
  COMMERCIAL_SITE_SECURITY_HEADERS,
} from "@/lib/httpSecurityHeaders";

describe("httpSecurityHeaders", () => {
  it("builds CSP with nonce and strict-dynamic, without script-src unsafe-inline", () => {
    const csp = buildCommercialSiteContentSecurityPolicy("abc123", { allowEval: false });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' https://va.vercel-scripts.com;");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(csp).not.toMatch(/style-src[^;]*'unsafe-inline'/);
  });

  it("may include unsafe-eval for dev tooling when allowEval is true", () => {
    const csp = buildCommercialSiteContentSecurityPolicy("n", { allowEval: true });
    expect(csp).toContain("'unsafe-eval'");
  });

  it("exports a stable nonce header name for middleware and layout", () => {
    expect(COMMERCIAL_SITE_CSP_NONCE_HEADER).toBe("x-csp-nonce");
  });

  it("exports headers in fixed order with exact key/value pairs (no CSP — set in middleware)", () => {
    expect(COMMERCIAL_SITE_SECURITY_HEADERS).toEqual([
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ]);
  });
});
