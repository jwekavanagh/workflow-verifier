import { execSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { extract as extractTar } from "tar";
import { parse } from "yaml";
import { productCopy } from "@/content/productCopy";
import {
  getRepoRoot,
  loadAnchors,
  expectedNpmPackageJsonFields,
} from "./helpers/distributionGraphHelpers";
import {
  ensureMarketingSiteRunning,
  getSiteHtml,
  registerMarketingSiteTeardown,
} from "./helpers/siteTestServer";
import { assertServedOpenApiCommercialDistribution } from "./helpers/openApiCommercialDistribution";

const require = createRequire(import.meta.url);
const { normalize } = require("../../scripts/public-product-anchors.cjs") as {
  normalize: (s: string) => string;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Flatten HTML into decoded text and attribute values in tree order so JSON discovery
 * needles (plain `&`, quotes, etc.) match what the browser exposes without manual
 * entity replacement (avoids CodeQL js/double-escaping on test-only normalization).
 */
function htmlForTextNeedleMatch(html: string): string {
  const { window } = new JSDOM(html);
  const { Node: DomNode } = window;
  const root = window.document.documentElement;
  if (!root) return "";

  const parts: string[] = [];
  function visit(el: Element): void {
    const { attributes } = el;
    for (let i = 0; i < attributes.length; i++) {
      parts.push(attributes[i]!.value);
    }
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === DomNode.TEXT_NODE) {
        parts.push(child.textContent ?? "");
      } else if (child.nodeType === DomNode.ELEMENT_NODE) {
        visit(child as Element);
      }
    }
  }
  visit(root);
  return parts.join("");
}

registerMarketingSiteTeardown();

describe(
  "distribution graph",
  { timeout: 180_000 },
  () => {
    const repoRoot = getRepoRoot();

    beforeAll(async () => {
      const anchors0 = loadAnchors();
      process.env.NEXT_PUBLIC_APP_URL = normalize(anchors0.productionCanonicalOrigin);
      process.env.VERCEL_ENV = "production";

      if (!process.env.DATABASE_URL?.trim()) {
        throw new Error("distribution-graph: run website Vitest via npm run validate-commercial from repo root");
      }

      const a = loadAnchors();
      const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
      const start = "<!-- public-product-anchors:start -->";
      const end = "<!-- public-product-anchors:end -->";
      const i0 = readme.indexOf(start);
      const i1 = readme.indexOf(end);
      expect(i0).toBeGreaterThanOrEqual(0);
      expect(i1).toBeGreaterThan(i0);
      const slice = readme.slice(i0, i1 + end.length);
      expect(slice).toContain(a.gitRepositoryUrl);
      expect(slice).toContain(a.npmPackageUrl);
      expect(slice).toContain(a.productionCanonicalOrigin);
      expect(slice).toContain(`${a.productionCanonicalOrigin}/integrate`);
      expect(slice).toContain(`${a.productionCanonicalOrigin}/openapi-commercial-v1.yaml`);
      expect(slice).toContain(`${a.productionCanonicalOrigin}/llms.txt`);

      const packDest = mkdtempSync(join(tmpdir(), "wfv-pack-"));
      execSync(`npm pack --pack-destination "${packDest.replace(/\\/g, "/")}"`, {
        cwd: repoRoot,
        stdio: "inherit",
        shell: true,
      });
      const tgzNames = readdirSync(packDest).filter((f) => f.endsWith(".tgz"));
      expect(tgzNames.length).toBe(1);
      const tgzName = tgzNames[0]!;
      const extractDir = mkdtempSync(join(tmpdir(), "wfv-extract-"));
      await extractTar({ file: join(packDest, tgzName), cwd: extractDir });
      const pkgJson = JSON.parse(
        readFileSync(join(extractDir, "package", "package.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(pkgJson).toMatchObject(expectedNpmPackageJsonFields(a));
      rmSync(packDest, { recursive: true, force: true });
      rmSync(extractDir, { recursive: true, force: true });

      await ensureMarketingSiteRunning();
    });

    it("pack matches discovery; served pages match anchors", async () => {
      const a = loadAnchors();
      const discoveryPath = join(repoRoot, "config", "discovery-acquisition.json");
      const disc = JSON.parse(readFileSync(discoveryPath, "utf8")) as {
        slug: string;
        visitorProblemAnswer: string;
        heroTitle: string;
        heroSubtitle: string;
        homepageAcquisitionCtaLabel: string;
        homepageDecisionFraming: string;
        homepageHero: { what: string; why: string; when: string };
        pageMetadata: { description: string };
        shareableTerminalDemo: { title: string; transcript: string };
      };

      const html = await getSiteHtml("/");
      const o = normalize(process.env.NEXT_PUBLIC_APP_URL ?? "");
      const canonicalOrigin = normalize(a.productionCanonicalOrigin);
      expect(html).toContain(a.gitRepositoryUrl);
      expect(html).toContain(a.npmPackageUrl);
      expect(html).toContain(`${o}/openapi-commercial-v1.yaml`);
      expect(html).toMatch(/og\.png/);
      expect(html).toContain("application/ld+json");
      expect(html).toContain("SoftwareApplication");
      expect(html).toContain("summary_large_image");

      const htmlDecoded = htmlForTextNeedleMatch(html);
      expect(htmlDecoded).toContain(disc.pageMetadata.description);
      expect(html).toContain('property="og:description"');
      expect(html).toContain('name="description"');
      expect(htmlDecoded).not.toContain(a.identityOneLiner);

      const llmsText = await getSiteHtml("/llms.txt");
      expect(llmsText).toContain(a.identityOneLiner);
      expect(llmsText).toContain(`${canonicalOrigin}/integrate`);
      expect(llmsText).toContain(`- Learn: ${canonicalOrigin}/guides`);
      expect(llmsText).toContain(`${canonicalOrigin}/openapi-commercial-v1.yaml`);
      expect(llmsText).toContain(a.gitRepositoryUrl);
      expect(llmsText).toContain(a.npmPackageUrl);
      expect(llmsText.includes("example.invalid")).toBe(false);
      expect(llmsText).toContain("- OpenAPI (repo raw): ");
      expect(llmsText).toContain("- llms.txt (repo raw): ");
      expect(llmsText).toContain(
        "raw.githubusercontent.com/jwekavanagh/agentskeptic/refs/heads/main/schemas/openapi-commercial-v1.yaml",
      );
      expect(llmsText).toContain(
        "raw.githubusercontent.com/jwekavanagh/agentskeptic/refs/heads/main/llms.txt",
      );

      const hGuides = llmsText.indexOf("## Indexable guides");
      const hExamples = llmsText.indexOf("## Indexable examples");
      const hDemo = llmsText.indexOf(`## ${disc.shareableTerminalDemo.title}`);
      const hIntent = llmsText.indexOf("## Intent phrases");
      expect(hGuides).toBeGreaterThanOrEqual(0);
      expect(hExamples).toBeGreaterThan(hGuides);
      expect(hDemo).toBeGreaterThan(hExamples);
      expect(hDemo).toBeGreaterThanOrEqual(0);
      expect(hIntent).toBeGreaterThan(hDemo);
      const hNot = llmsText.indexOf("## Not for");
      const hRel = llmsText.indexOf("## Related queries");
      const hHurts = llmsText.indexOf("## When this hurts (search-shaped)");
      const hProb = llmsText.indexOf("## Problem framing (shareable)");
      const hVis = llmsText.indexOf("## Visitor problem (canonical answer)");
      expect(hIntent).toBeGreaterThanOrEqual(0);
      expect(hNot).toBeGreaterThan(hIntent);
      expect(hRel).toBeGreaterThan(hNot);
      expect(hHurts).toBeGreaterThan(hRel);
      expect(hProb).toBeGreaterThan(hHurts);
      expect(hVis).toBeGreaterThan(hProb);

      const acquisitionAbs = `${canonicalOrigin}${disc.slug}`;
      expect(llmsText.includes(acquisitionAbs)).toBe(true);

      const visitorHeading = "## Visitor problem (canonical answer)";
      const afterVis = llmsText.slice(hVis + visitorHeading.length);
      const nextSection = afterVis.search(/\n## /);
      const visitorBodyRaw = nextSection === -1 ? afterVis : afterVis.slice(0, nextSection);
      expect(visitorBodyRaw.trim()).toBe(disc.visitorProblemAnswer.trim());

      const acqHtml = await getSiteHtml(disc.slug);
      const acqText = htmlForTextNeedleMatch(acqHtml);
      const visitorFirst = disc.visitorProblemAnswer.split(/\n\n+/)[0] ?? disc.visitorProblemAnswer;
      const acqVis = acqText.indexOf(visitorFirst);
      const acqSub = acqText.indexOf(disc.heroSubtitle);
      const acqTerm = acqText.indexOf(disc.shareableTerminalDemo.transcript.slice(0, 80));
      const acqWhy = acqText.indexOf(disc.homepageHero.why);
      const acqWhat = acqText.indexOf(disc.homepageHero.what);
      const acqWhen = acqText.indexOf(disc.homepageHero.when);
      expect(acqVis).toBeGreaterThanOrEqual(0);
      expect(acqSub).toBeGreaterThan(acqVis);
      expect(acqTerm).toBeGreaterThan(acqSub);
      expect(acqWhy).toBeGreaterThan(acqTerm);
      expect(acqWhat).toBeGreaterThan(acqWhy);
      expect(acqWhen).toBeGreaterThan(acqWhat);
      expect(acqHtml).toContain('data-testid="acquisition-hero-title"');
      expect(acqText).toContain(disc.heroTitle);
      expect(acqHtml).toContain('data-testid="visitor-problem-answer"');
      expect(acqText).toContain(visitorFirst);
      expect(acqHtml).toContain('data-testid="acquisition-terminal-demo"');
      expect(htmlForTextNeedleMatch(acqHtml)).toContain(
        disc.shareableTerminalDemo.transcript.slice(0, 80),
      );

      // Homepage `/`: hero (includes try-it embed), failure excerpt, what-this-catches + strip links, stakes, how-it-works; no homepageHero narrative.
      const homeAgain = await getSiteHtml("/");
      const homeAgainText = htmlForTextNeedleMatch(homeAgain);
      expect(homeAgainText).toContain(disc.heroTitle);
      expect(homeAgainText).toContain(disc.homepageDecisionFraming);
      expect(homeAgainText).toContain(productCopy.homeHeroShortTagline);
      expect(homeAgainText).not.toContain(disc.heroSubtitle);
      const idxTitle = homeAgainText.indexOf(disc.heroTitle);
      const idxFrame = homeAgainText.indexOf(disc.homepageDecisionFraming);
      const idxSub = homeAgainText.indexOf(productCopy.homeHeroShortTagline);
      // htmlForTextNeedleMatch is attribute values + text only (no literal `data-testid="…"` substrings).
      const idxHow = homeAgainText.indexOf("home-how-it-works");
      expect(idxTitle).toBeGreaterThanOrEqual(0);
      expect(idxFrame).toBeGreaterThan(idxTitle);
      expect(idxSub).toBeGreaterThan(idxFrame);
      expect(idxHow).toBeGreaterThan(idxSub);
      expect(homeAgainText).not.toContain(disc.homepageHero.why);
      expect(homeAgainText).not.toContain(disc.homepageHero.what);
      expect(homeAgainText).not.toContain(disc.homepageHero.when);
      expect(homeAgain).not.toContain('data-testid="home-cold-proof"');
      expect(homeAgainText).not.toContain(disc.shareableTerminalDemo.transcript.slice(0, 80));
      expect(homeAgain).toContain('data-testid="home-how-it-works"');
      expect(homeAgain).toContain('data-testid="home-try-it"');
      const ctaNeedle = 'data-testid="homepage-acquisition-cta"';
      const ctaIdx = homeAgain.indexOf(ctaNeedle);
      expect(ctaIdx).toBeGreaterThanOrEqual(0);
      const aOpen = homeAgain.lastIndexOf("<a", ctaIdx);
      expect(aOpen).toBeGreaterThanOrEqual(0);
      const aClose = homeAgain.indexOf("</a>", ctaIdx);
      expect(aClose).toBeGreaterThan(ctaIdx);
      const aTag = homeAgain.slice(aOpen, aClose + 4);
      expect(aTag.includes(`href="${disc.slug}"`)).toBe(true);
      expect(aTag.replace(/\s+/g, " ").trim()).toContain(disc.homepageAcquisitionCtaLabel);

      const navPrimary = homeAgain.indexOf('aria-label="Primary"');
      expect(navPrimary).toBeGreaterThanOrEqual(0);
      const navSlice = homeAgain.slice(navPrimary, navPrimary + 4000);
      expect(navSlice).toContain(`href="${disc.slug}"`);
      expect(navSlice).toContain('href="/guides"');
      expect(navSlice).not.toContain('href="/security"');
      expect(htmlForTextNeedleMatch(navSlice)).toContain(disc.homepageAcquisitionCtaLabel);
      expect(homeAgain).toContain('href="/security"');

      const secHtml = await getSiteHtml("/security");
      expect(htmlForTextNeedleMatch(secHtml)).toContain(productCopy.securityTrust.title);

      const sitemapXml = await getSiteHtml("/sitemap.xml");
      expect(sitemapXml).toContain(`${canonicalOrigin}/llms.txt`);
      expect(sitemapXml).toContain(`${canonicalOrigin}/integrate`);
      expect(sitemapXml).toContain(`${canonicalOrigin}/guides`);
      expect(sitemapXml).toContain(`${canonicalOrigin}/support`);
      expect(sitemapXml).toContain(`${canonicalOrigin}/openapi-commercial-v1.yaml`);
      expect(sitemapXml).toContain(`${canonicalOrigin}/security`);
      expect(sitemapXml).toContain(acquisitionAbs);
      expect(sitemapXml).toContain(`${canonicalOrigin}/examples/wf-complete`);
      expect(sitemapXml).toContain(`${canonicalOrigin}/examples/wf-missing`);
      expect(sitemapXml).not.toMatch(/\/r\//);

      const robotsTxt = await getSiteHtml("/robots.txt");
      expect(robotsTxt).toContain(`${canonicalOrigin}/sitemap.xml`);
      expect(robotsTxt).toMatch(/Allow:\s*\//);

      const yamlText = await getSiteHtml("/openapi-commercial-v1.yaml");
      const doc = parse(yamlText) as Record<string, unknown>;
      assertServedOpenApiCommercialDistribution(doc, yamlText, {
        anchors: a,
        normalize,
        canonicalOrigin,
        serversOriginForUrlLine: o,
        escapeRegExp,
      });
    }, 180_000);

    afterAll(() => {
      delete process.env.VERCEL_ENV;
      delete process.env.NEXT_PUBLIC_APP_URL;
    });
  },
);
