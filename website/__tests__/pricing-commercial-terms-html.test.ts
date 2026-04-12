import * as cheerio from "cheerio";
import { describe, expect, beforeAll, it } from "vitest";
import { productCopy } from "@/content/productCopy";
import {
  ensureMarketingSiteRunning,
  getSiteHtml,
  registerMarketingSiteTeardown,
} from "./helpers/siteTestServer";

registerMarketingSiteTeardown();

describe("pricing commercial terms HTML", { timeout: 180_000 }, () => {
  beforeAll(async () => {
    await ensureMarketingSiteRunning();
  });

  it("main ul lists bullets with one strong per li (lead first, body in text)", async () => {
    const html = await getSiteHtml("/pricing");
    const $ = cheerio.load(html);
    const $ul = $("main ul[aria-label='Commercial terms']");
    expect($ul.length).toBe(1);
    const $lis = $ul.find("> li");
    expect($lis.length).toBe(productCopy.pricingCommercialTermsBullets.length);
    for (let i = 0; i < $lis.length; i++) {
      const $li = $lis.eq(i);
      const row = productCopy.pricingCommercialTermsBullets[i]!;
      const $strongs = $li.find("strong");
      expect($strongs.length).toBe(1);
      const first = $li.contents().first();
      expect(first.is("strong")).toBe(true);
      expect($strongs.first().text().trim()).toBe(row.lead);
      const liText = $li.text().replace(/\s+/g, " ").trim();
      expect(liText).toContain(row.body);
    }
  });
});
