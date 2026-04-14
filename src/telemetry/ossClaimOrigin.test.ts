import { describe, expect, it } from "vitest";
import { PUBLIC_CANONICAL_SITE_ORIGIN } from "../publicDistribution.generated.js";
import { resolveOssClaimApiOrigin } from "./ossClaimOrigin.js";

describe("resolveOssClaimApiOrigin", () => {
  it("matches trimmed PUBLIC_CANONICAL_SITE_ORIGIN", () => {
    expect(resolveOssClaimApiOrigin()).toBe(PUBLIC_CANONICAL_SITE_ORIGIN.replace(/\/$/, ""));
  });
});
