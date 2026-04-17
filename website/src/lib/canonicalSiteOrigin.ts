import { publicProductAnchors } from "@/lib/publicProductAnchors";

/** `VERCEL_ENV === "production"` — single production-like definition (see docs/website-security-and-operations.md). */
export function isProductionLike(): boolean {
  return process.env.VERCEL_ENV === "production";
}

const MISSING_URL_IN_PROD =
  "NEXT_PUBLIC_APP_URL is required when VERCEL_ENV=production";

/** Default loopback origin when `NEXT_PUBLIC_APP_URL` is unset (local `next dev` / `next start`). */
function localListenLoopbackOrigin(): string {
  const p = process.env.PORT?.trim();
  const port = p && /^\d+$/.test(p) ? p : "3000";
  return `http://127.0.0.1:${port}`;
}

/**
 * Canonical browser origin for server-built absolute URLs (no Request / forwarded headers).
 * Precedence: (1) NEXT_PUBLIC_APP_URL origin, (2) local loopback using PORT, (3) anchor origin.
 * @throws When `VERCEL_ENV=production` and NEXT_PUBLIC_APP_URL is empty.
 */
export function getCanonicalSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  if (raw.length > 0) {
    try {
      return new URL(raw).origin;
    } catch {
      throw new Error("NEXT_PUBLIC_APP_URL must be an absolute URL with a valid scheme.");
    }
  }

  if (isProductionLike()) {
    throw new Error(MISSING_URL_IN_PROD);
  }

  const nodeEnv = process.env.NODE_ENV;
  // Next `next dev` sets `development`; some tooling leaves NODE_ENV unset — still treat as local.
  if (!nodeEnv || nodeEnv === "development" || nodeEnv === "test") {
    return localListenLoopbackOrigin();
  }

  // Local `next start` (production build) off Vercel without a public URL.
  if (nodeEnv === "production" && process.env.VERCEL !== "1") {
    return localListenLoopbackOrigin();
  }

  return publicProductAnchors.productionCanonicalOrigin.replace(/\/$/, "");
}

/**
 * In Vercel production, force magic-link URLs to {@link getCanonicalSiteOrigin} so emailed links never
 * use a deployment hostname (for example `*.vercel.app`). Those hosts are higher-risk in phishing
 * classifiers and confuse users; the canonical domain should match `NEXT_PUBLIC_APP_URL`.
 */
export function rewriteMagicLinkUrlForProductionEmail(url: string): string {
  if (!isProductionLike()) return url;
  const canonicalOrigin = getCanonicalSiteOrigin();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const target = new URL(canonicalOrigin);
  if (parsed.origin === target.origin) return url;
  return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, canonicalOrigin).toString();
}
