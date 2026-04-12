import * as cheerio from "cheerio";
import { describe, expect, beforeAll, it } from "vitest";
import { productCopy } from "@/content/productCopy";
import { publicProductAnchors } from "@/lib/publicProductAnchors";
import { buildSiteFooterLegalLinks, buildSiteFooterProductLinks } from "@/lib/siteChrome";
import {
  ensureMarketingSiteRunning,
  getSiteHtml,
  registerMarketingSiteTeardown,
} from "./helpers/siteTestServer";

registerMarketingSiteTeardown();

describe("buyer-surface HTML contracts (R2–R6)", { timeout: 180_000 }, () => {
  beforeAll(async () => {
    await ensureMarketingSiteRunning();
  });

  it("footer product row order github → npm → openapi → issues → company (R2)", async () => {
    const html = await getSiteHtml("/");
    const $ = cheerio.load(html);
    const hrefs = $("footer nav[aria-label='Product links'] a")
      .map((_, el) => $(el).attr("href") ?? "")
      .get();
    expect(hrefs[0]).toBe(publicProductAnchors.gitRepositoryUrl);
    expect(hrefs[1]).toBe(publicProductAnchors.npmPackageUrl);
    expect(hrefs[2]).toMatch(/openapi-commercial-v1\.yaml$/);
    expect(hrefs[3]).toBe(publicProductAnchors.bugsUrl);
    expect(hrefs[4]).toBe("/company");
    expect(hrefs).toHaveLength(5);
  });

  it("footer legal row security → privacy → terms (R2)", async () => {
    const expected = buildSiteFooterLegalLinks().map((l) => l.href);
    const html = await getSiteHtml("/");
    const $ = cheerio.load(html);
    const hrefs = $("footer nav[aria-label='Trust and legal'] a")
      .map((_, el) => $(el).attr("href") ?? "")
      .get();
    expect(hrefs).toEqual(expected);
  });

  it("homepage trust strip has five keyed testids (R3)", async () => {
    const html = await getSiteHtml("/");
    for (const key of ["openapi", "npm", "github", "acquisition", "integrate"]) {
      expect(html).toContain(`data-testid="home-trust-strip-${key}"`);
    }
  });

  it("/pricing trust band matches productCopy (R4)", async () => {
    const html = await getSiteHtml("/pricing");
    expect(html).toContain('data-testid="pricing-trust-band"');
    const $ = cheerio.load(html);
    const band = $('[data-testid="pricing-trust-band"]');
    expect(band.find("h2").first().text().trim()).toBe(productCopy.pricingTrustBandBeforeGrid.title);
    const paras = band.find("p").toArray().map((el) => $(el).text().trim());
    expect(paras).toContain(productCopy.pricingTrustBandBeforeGrid.paragraphs[0]);
    expect(paras).toContain(productCopy.pricingTrustBandBeforeGrid.paragraphs[1]);
  });

  it("/security quick facts match productCopy (R5)", async () => {
    const html = await getSiteHtml("/security");
    expect(html).toContain('data-testid="security-quick-facts"');
    const $ = cheerio.load(html);
    const sec = $('[data-testid="security-quick-facts"]');
    expect(sec.find("h2").first().text().trim()).toBe(productCopy.securityQuickFacts.title);
    const bullets = sec.find("li").toArray().map((el) => $(el).text().trim());
    for (const b of productCopy.securityQuickFacts.bullets) {
      expect(bullets).toContain(b);
    }
  });

  it("/company issues link href is bugsUrl and headings match productCopy (R6)", async () => {
    const html = await getSiteHtml("/company");
    const $ = cheerio.load(html);
    const issues = $('[data-testid="company-issues-link"]');
    expect(issues.attr("href")).toBe(publicProductAnchors.bugsUrl);
    expect($("main h1").first().text().trim()).toBe(productCopy.companyPage.h1);
    expect($("main").text()).toContain(productCopy.companyPage.intro);
  });
});
