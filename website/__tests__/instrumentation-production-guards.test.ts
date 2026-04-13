import { describe, expect, it, vi, afterEach } from "vitest";
import {
  assertProductionCommercialGuards,
  PRODUCTION_COMMERCIAL_GUARD_VIOLATION_MESSAGE,
} from "@/lib/assertProductionCommercialGuards";

describe("assertProductionCommercialGuards", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws exact message when VERCEL_ENV=production and E2E_COMMERCIAL_FUNNEL=1", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("E2E_COMMERCIAL_FUNNEL", "1");
    delete process.env.RESERVE_EMERGENCY_ALLOW;
    expect(() => assertProductionCommercialGuards()).toThrow(
      PRODUCTION_COMMERCIAL_GUARD_VIOLATION_MESSAGE,
    );
  });

  it("throws exact message when VERCEL_ENV=production and RESERVE_EMERGENCY_ALLOW=1", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    delete process.env.E2E_COMMERCIAL_FUNNEL;
    vi.stubEnv("RESERVE_EMERGENCY_ALLOW", "1");
    expect(() => assertProductionCommercialGuards()).toThrow(
      PRODUCTION_COMMERCIAL_GUARD_VIOLATION_MESSAGE,
    );
  });

  it("does not throw when VERCEL_ENV=preview even if E2E_COMMERCIAL_FUNNEL=1", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("E2E_COMMERCIAL_FUNNEL", "1");
    expect(() => assertProductionCommercialGuards()).not.toThrow();
  });
});

describe("instrumentation register", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("register throws same message when production and forbidden env set", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("E2E_COMMERCIAL_FUNNEL", "1");
    vi.resetModules();
    const { register } = await import("../instrumentation");
    expect(() => register()).toThrow(PRODUCTION_COMMERCIAL_GUARD_VIOLATION_MESSAGE);
  });
});
