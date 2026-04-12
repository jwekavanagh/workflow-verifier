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

  it("has exactly one page-level main h1 with integrate title", async () => {
    const html = await getSiteHtml("/integrate");
    const $ = cheerio.load(html);
    // Embedded markdown uses `#` headings → nested `<h1>` inside `.integrate-prose`; only the route title is a direct child of `<main>`.
    const $h1 = $("main.integrate-main > h1");
    expect($h1.length).toBe(1);
    expect($h1.text().trim()).toBe(siteMetadata.integrate.title);
  });
});
