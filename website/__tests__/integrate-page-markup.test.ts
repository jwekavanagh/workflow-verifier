import * as cheerio from "cheerio";
import { describe, expect, beforeAll, it } from "vitest";
import { siteMetadata } from "@/content/siteMetadata";
import {
  ensureMarketingSiteRunning,
  getSiteHtml,
  registerMarketingSiteTeardown,
} from "./helpers/siteTestServer";

registerMarketingSiteTeardown();

describe("integrate page markup", { timeout: 180_000 }, () => {
  beforeAll(async () => {
    await ensureMarketingSiteRunning();
  });

  it("has exactly one main h1 with integrate title", async () => {
    const html = await getSiteHtml("/integrate");
    const $ = cheerio.load(html);
    const $h1 = $("main h1");
    expect($h1.length).toBe(1);
    expect($h1.first().text().trim()).toBe(siteMetadata.integrate.title);
  });
});
