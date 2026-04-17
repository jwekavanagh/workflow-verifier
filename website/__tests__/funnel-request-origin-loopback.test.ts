import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

describe("isFunnelSurfaceRequestOriginAllowed loopback", () => {
  beforeEach(() => {
    vi.stubEnv("PORT", "");
    // validate-commercial (and distribution-graph) inject VERCEL_ENV=production for website Vitest;
    // these tests model local dev where empty NEXT_PUBLIC must not trip production URL requirements.
    vi.stubEnv("VERCEL_ENV", "preview");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows localhost Origin when canonical is 127.0.0.1 in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const { isFunnelSurfaceRequestOriginAllowed } = await import("@/lib/funnelRequestOriginAllowed");
    const req = new NextRequest("http://127.0.0.1:3000/api/integrator/registry-draft", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    expect(isFunnelSurfaceRequestOriginAllowed(req)).toBe(true);
  });

  it("allows IPv6 bracket [::1] Origin when canonical is http://localhost (NEXT_PUBLIC)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    const { isFunnelSurfaceRequestOriginAllowed } = await import("@/lib/funnelRequestOriginAllowed");
    const req = new NextRequest("http://localhost:3000/api/integrator/registry-draft", {
      method: "POST",
      headers: { origin: "http://[::1]:3000" },
    });
    expect(isFunnelSurfaceRequestOriginAllowed(req)).toBe(true);
  });

  it("allows Origin port when it matches Host even if NEXT_PUBLIC pins a different loopback port", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    const { isFunnelSurfaceRequestOriginAllowed } = await import("@/lib/funnelRequestOriginAllowed");
    const req = new NextRequest("http://localhost:3001/api/integrator/registry-draft", {
      method: "POST",
      headers: {
        host: "localhost:3001",
        origin: "http://localhost:3001",
      },
    });
    expect(isFunnelSurfaceRequestOriginAllowed(req)).toBe(true);
  });

  it("does not equate loopback with production canonical", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://agentskeptic.com");
    const { isFunnelSurfaceRequestOriginAllowed } = await import("@/lib/funnelRequestOriginAllowed");
    const req = new NextRequest("https://agentskeptic.com/api/integrator/registry-draft", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    expect(isFunnelSurfaceRequestOriginAllowed(req)).toBe(false);
  });
});
