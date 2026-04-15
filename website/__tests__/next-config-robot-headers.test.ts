import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("next.config headers for /r/*", () => {
  const saved: Partial<Record<"VERCEL" | "NEXT_PUBLIC_APP_URL", string | undefined>> = {};

  beforeEach(() => {
    vi.resetModules();
    saved.VERCEL = process.env.VERCEL;
    saved.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL = "1";
    process.env.NEXT_PUBLIC_APP_URL = "https://agentskeptic.com";
  });

  afterEach(() => {
    if (saved.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = saved.VERCEL;
    if (saved.NEXT_PUBLIC_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = saved.NEXT_PUBLIC_APP_URL;
  });

  it("sets X-Robots-Tag noindex for /r/:path*", async () => {
    const mod = await import("../next.config");
    const cfg = mod.default as { headers?: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
    expect(typeof cfg.headers).toBe("function");
    const rows = await cfg.headers!();
    const rRow = rows.find((r) => r.source === "/r/:path*");
    expect(rRow).toBeDefined();
    expect(rRow!.headers).toEqual([{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
  });

  it("disables poweredByHeader so responses omit X-Powered-By", async () => {
    const mod = await import("../next.config");
    expect((mod.default as { poweredByHeader?: boolean }).poweredByHeader).toBe(false);
  });
});
