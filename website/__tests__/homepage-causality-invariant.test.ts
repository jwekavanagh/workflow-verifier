import * as cheerio from "cheerio";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, beforeAll, it } from "vitest";
import { productCopy } from "@/content/productCopy";
import { getRepoRoot } from "./helpers/distributionGraphHelpers";
import {
  ensureMarketingSiteRunning,
  getSiteHtml,
  registerMarketingSiteTeardown,
} from "./helpers/siteTestServer";

registerMarketingSiteTeardown();

function mainVisibleText(html: string): string {
  const $ = cheerio.load(html);
  const $main = $("main").first().clone();
  $main.find("script, style, noscript").remove();
  return $main.text().replace(/\s+/g, " ").trim();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

describe("homepage causality invariant", { timeout: 180_000 }, () => {
  beforeAll(async () => {
    await ensureMarketingSiteRunning();
  });

  it("exactly one canonical not-guaranteed sentence in main visible text; visitor prefix absent; mechanism copy static rules", async () => {
    const root = getRepoRoot();
    const discoveryPath = join(root, "config", "discovery-acquisition.json");
    const disc = JSON.parse(readFileSync(discoveryPath, "utf8")) as {
      visitorProblemAnswer: string;
    };

    const html = await getSiteHtml("/");
    const visible = mainVisibleText(html);
    const sentence = productCopy.guarantees.notGuaranteed[0];
    expect(countOccurrences(visible, sentence)).toBe(1);

    const visitorPrefix = disc.visitorProblemAnswer.slice(0, 120);
    expect(visible.includes(visitorPrefix)).toBe(false);

    const mech = productCopy.mechanism.notObservability;
    expect(mech.toLowerCase()).not.toContain("causal");
    expect(mech.toLowerCase()).not.toContain("not proof");

    expect(disc.visitorProblemAnswer.toLowerCase()).not.toContain("causality");
  });
});
