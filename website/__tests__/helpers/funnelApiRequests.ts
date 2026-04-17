/** Shared NextRequest factories for funnel API integration tests (single URL/header contract). */
import {
  PRODUCT_ACTIVATION_CLI_PRODUCT_HEADER,
  PRODUCT_ACTIVATION_CLI_VERSION_HEADER,
} from "@/lib/funnelProductActivationConstants";
import { NextRequest } from "next/server";

export function surfaceImpressionPostRequest(body: unknown, origin: string | null): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  return new NextRequest("http://127.0.0.1:3000/api/funnel/surface-impression", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export function productActivationPostRequest(
  body: unknown,
  opts: {
    cliVersionSemver: string;
    extraHeaders?: Record<string, string>;
    /** When false, omits CLI product/version headers (403 negative path). Default true. */
    includeCliHeaders?: boolean;
  },
): NextRequest {
  const h = new Headers({ "content-type": "application/json" });
  const includeCli = opts.includeCliHeaders !== false;
  if (includeCli) {
    h.set(PRODUCT_ACTIVATION_CLI_PRODUCT_HEADER, "cli");
    h.set(PRODUCT_ACTIVATION_CLI_VERSION_HEADER, opts.cliVersionSemver);
  }
  if (opts.extraHeaders) {
    for (const [k, v] of Object.entries(opts.extraHeaders)) {
      h.set(k, v);
    }
  }
  return new NextRequest("http://127.0.0.1:3000/api/funnel/product-activation", {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
}
