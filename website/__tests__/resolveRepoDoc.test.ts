import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveFirstRunIntegrationMd } from "@/lib/resolveRepoDoc";

const repoRoot = path.resolve(__dirname, "..", "..");
const docPath = path.join(repoRoot, "docs", "first-run-integration.md");

describe("resolveFirstRunIntegrationMd", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns path from monorepo root cwd", () => {
    vi.spyOn(process, "cwd").mockReturnValue(repoRoot);
    const p = resolveFirstRunIntegrationMd();
    expect(p).toBe(docPath);
    expect(existsSync(p!)).toBe(true);
  });

  it("returns path from website/ cwd", () => {
    vi.spyOn(process, "cwd").mockReturnValue(path.join(repoRoot, "website"));
    const p = resolveFirstRunIntegrationMd();
    expect(p).toBe(docPath);
    expect(existsSync(p!)).toBe(true);
  });
});
