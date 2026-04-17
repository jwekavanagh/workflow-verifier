import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

describe("isFunnelSurfaceRequestOriginAllowed loopback", () => {
  it("allows localhost Origin when canonical is 127.0.0.1 in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const { isFunnelSurfaceRequestOriginAllowed } = await import("@/lib/funnelRequestOriginAllowed");
    const req = new NextRequest("http://127.0.0.1:3000/api/integrator/registry-draft", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    expect(isFunnelSurfaceRequestOriginAllowed(req)).toBe(true);
    vi.unstubAllEnvs();
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
    vi.unstubAllEnvs();
  });
});
