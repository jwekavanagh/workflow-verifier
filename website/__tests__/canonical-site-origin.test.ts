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

  it("uses PORT for local loopback when URL unset in test", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("PORT", "4000");
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getCanonicalSiteOrigin()).toBe("http://127.0.0.1:4000");
  });

  it("uses local loopback for NODE_ENV production off Vercel when URL unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL", "0");
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.PORT;
    expect(getCanonicalSiteOrigin()).toBe("http://127.0.0.1:3000");
  });

  it("uses local loopback when NODE_ENV is unset and URL unset (not production-like)", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL", "0");
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.PORT;
    const prev = process.env.NODE_ENV;
    delete (process.env as { NODE_ENV?: string }).NODE_ENV;
    try {
      expect(getCanonicalSiteOrigin()).toBe("http://127.0.0.1:3000");
    } finally {
      if (prev !== undefined) process.env.NODE_ENV = prev;
    }
  });
});
