import { describe, expect, it, vi, afterEach } from "vitest";
import { getCanonicalSiteOrigin, isProductionLike } from "@/lib/canonicalSiteOrigin";

describe("canonicalSiteOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("isProductionLike is true only when VERCEL_ENV is production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isProductionLike()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isProductionLike()).toBe(false);
  });

  it("returns NEXT_PUBLIC_APP_URL origin when set", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com/app/");
    expect(getCanonicalSiteOrigin()).toBe("https://example.com");
  });

  it("throws exact message when VERCEL_ENV=production and URL empty", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(() => getCanonicalSiteOrigin()).toThrow(
      "NEXT_PUBLIC_APP_URL is required when VERCEL_ENV=production",
    );
  });

  it("returns 127.0.0.1 in test when URL unset and not production-like", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "preview");
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getCanonicalSiteOrigin()).toBe("http://127.0.0.1:3000");
  });
});
