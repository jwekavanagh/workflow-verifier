/**
 * CSP is built per request in `middleware.ts` (nonce + `strict-dynamic`) so
 * `script-src` never needs `unsafe-inline`. Other headers stay here for `next.config.ts` and tests.
 * @see docs/website-security-and-operations.md
 */

export type CommercialSiteCspOptions = {
  /** Next.js webpack dev / HMR may rely on `eval`. Omit in production CSP. */
  allowEval?: boolean;
};

/**
 * Single source for CSP directive text. Call from middleware with a fresh nonce per request.
 */
export function buildCommercialSiteContentSecurityPolicy(
  nonce: string,
  options: CommercialSiteCspOptions = {},
): string {
  const allowEval = options.allowEval ?? false;
  const evalPart = allowEval ? " 'unsafe-eval'" : "";
  return (
    "default-src 'self'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "frame-ancestors 'none'; " +
    "object-src 'none'; " +
    "upgrade-insecure-requests; " +
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${evalPart} https://va.vercel-scripts.com; ` +
    "connect-src 'self' https://vitals.vercel-insights.com https://va.vercel-scripts.com; " +
    "img-src 'self' data: blob:; " +
    "style-src 'self'; " +
    "font-src 'self' data:;"
  );
}

export const COMMERCIAL_SITE_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
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
];

/** Request header carrying the per-request nonce for app inline scripts (middleware sets this). */
export const COMMERCIAL_SITE_CSP_NONCE_HEADER = "x-csp-nonce";
