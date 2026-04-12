import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT_BLOCK = `:root {
  --bg: #0b0d10;
  --surface: #12151a;
  --surface-2: #2a3140;
  --fg: #e7e9ee;
  --muted: #98a1ad;
  --accent: #5c6cfa;
  --accent-contrast: #ffffff;
  --card: #151922;
  --border: #2a3140;
  /* Populated by next/font variable on <html> (see layout.tsx). */
  --font-heading: ui-sans-serif, system-ui, sans-serif;
}`;

const PRELUDE_SELECTORS = [
  ".card",
  "button, .btn",
  "button.secondary, .btn.secondary",
  ".btn-pricing-secondary",
  ".link-secondary",
  ".link-secondary:hover",
  ".link-tertiary",
  ".site-header",
  ".site-footer",
  ".site-nav a",
  ".site-nav a:hover",
  ".site-nav button.site-nav-signout",
  ".code-block",
  ".truth-report-pre",
  ".integrate-prose h2",
  ".integrate-prose pre",
  ".integrate-prose th, .integrate-prose td",
  ".integrate-prose hr",
  ".try-it-select",
  ".home-hero",
  ".home-hero-grid",
  ".home-hero-copy .home-cta-row",
  ".home-trust-strip",
  ".home-trust-strip-heading",
  ".home-trust-strip-list",
] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countPreludeBlocks(css: string, prelude: string): number {
  const re = new RegExp(`${escapeRegExp(prelude)}\\s*\\{`, "g");
  return (css.match(re) ?? []).length;
}

describe("globals.css buyer-surface contract", () => {
  const cssPath = path.join(__dirname, "..", "src", "app", "globals.css");
  const raw = readFileSync(cssPath, "utf8");
  const normalized = raw.replace(/\r\n/g, "\n");

  it("contains exact :root token block (§E)", () => {
    expect(normalized).toContain(ROOT_BLOCK);
  });

  it("uses shared surface tokens on key surfaces (pairings)", () => {
    expect(normalized).toContain("border: 1px solid var(--border)");
    expect(normalized).toContain("color: var(--fg)");
    expect(normalized).toContain("background: var(--surface-2)");
  });

  it("each listed selector prelude appears exactly once before a block (§CSS uniqueness)", () => {
    for (const prelude of PRELUDE_SELECTORS) {
      expect(countPreludeBlocks(normalized, prelude)).toBe(1);
    }
  });
});
