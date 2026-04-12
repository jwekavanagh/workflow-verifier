import { spawn, execSync, execFileSync, type ChildProcess } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { extract as extractTar } from "tar";
import { parse } from "yaml";
import {
  getRepoRoot,
  loadAnchors,
  expectedNpmPackageJsonFields,
} from "./helpers/distributionGraphHelpers";

const require = createRequire(import.meta.url);
const { normalize } = require("../../scripts/public-product-anchors.cjs") as {
  normalize: (s: string) => string;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** React escapes `"` in text nodes as `&quot;`; match discovery copy against fetch() HTML after decoding common entities. */
function htmlForTextNeedleMatch(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

describe(
  "distribution graph",
  { timeout: 180_000 },
  () => {
    const repoRoot = getRepoRoot();
    let child: ChildProcess | undefined;

    beforeAll(async () => {
      const anchors0 = loadAnchors();
      process.env.NEXT_PUBLIC_APP_URL = normalize(anchors0.productionCanonicalOrigin);
      process.env.VERCEL_ENV = "production";

      if (!process.env.DATABASE_URL?.trim()) {
        throw new Error("distribution-graph: run website Vitest via npm run validate-commercial from repo root");
      }

      execSync("npm run sync:public-product-anchors", {
        cwd: repoRoot,
        env: process.env,
        stdio: "inherit",
        shell: true,
      });

      execFileSync("npm", ["run", "build"], {
        cwd: join(repoRoot, "website"),
        env: process.env,
        stdio: "inherit",
      });

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
      execFileSync("npm", ["pack", "--pack-destination", packDest], {
        cwd: repoRoot,
        stdio: "inherit",
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

      const websiteDir = join(repoRoot, "website");
      const requireWebsite = createRequire(join(websiteDir, "package.json"));
      const nextBin = join(
        dirname(requireWebsite.resolve("next/package.json")),
        "dist",
        "bin",
        "next",
      );
      if (!existsSync(nextBin)) {
        throw new Error(
          `distribution-graph: Next.js CLI missing at ${nextBin} (install website dependencies)`,
        );
      }
      child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", "34100"], {
        cwd: websiteDir,
        env: process.env,
        stdio: "ignore",
        detached: false,
      });

      let ready = false;
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 200));
        try {
          const res = await fetch("http://127.0.0.1:34100/");
          if (res.status === 200) {
            ready = true;
            break;
          }
        } catch {
          /* retry */
        }
      }
      if (!ready) {
        throw new Error("distribution-graph: next start did not become ready");
      }

      const discoveryPath = join(repoRoot, "config", "discovery-acquisition.json");
      const disc = JSON.parse(readFileSync(discoveryPath, "utf8")) as {
        slug: string;
        visitorProblemAnswer: string;
        heroTitle: string;
        heroSubtitle: string;
        homepageAcquisitionCtaLabel: string;
        homepageHero: { what: string; why: string; when: string };
        pageMetadata: { description: string };
        shareableTerminalDemo: { title: string; transcript: string };
      };

      const html = await (await fetch("http://127.0.0.1:34100/")).text();
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

      const llmsText = await (await fetch("http://127.0.0.1:34100/llms.txt")).text();
      expect(llmsText).toContain(a.identityOneLiner);
      expect(llmsText).toContain(`${canonicalOrigin}/integrate`);
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

      const hDemo = llmsText.indexOf(`## ${disc.shareableTerminalDemo.title}`);
      const hIntent = llmsText.indexOf("## Intent phrases");
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

      const acqHtml = await (await fetch(`http://127.0.0.1:34100${disc.slug}`)).text();
      expect(acqHtml).toContain('data-testid="acquisition-hero-title"');
      expect(acqHtml).toContain(disc.heroTitle);
      expect(acqHtml).toContain('data-testid="visitor-problem-answer"');
      expect(acqHtml).toContain(disc.visitorProblemAnswer);
      expect(acqHtml).toContain('data-testid="acquisition-terminal-demo"');
      expect(htmlForTextNeedleMatch(acqHtml)).toContain(
        disc.shareableTerminalDemo.transcript.slice(0, 80),
      );

      // Homepage `/` contract (simplified): hero title + subtitle only, no cold-proof block,
      // no pasted terminal transcript; acquisition page still carries shareableTerminalDemo.
      const homeAgain = await (await fetch("http://127.0.0.1:34100/")).text();
      const homeAgainText = htmlForTextNeedleMatch(homeAgain);
      expect(homeAgainText).toContain(disc.heroTitle);
      expect(homeAgainText).toContain(disc.heroSubtitle);
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

      const sitemapXml = await (await fetch("http://127.0.0.1:34100/sitemap.xml")).text();
      expect(sitemapXml).toContain(`${canonicalOrigin}/llms.txt`);
      expect(sitemapXml).toContain(`${canonicalOrigin}/integrate`);
      expect(sitemapXml).toContain(`${canonicalOrigin}/openapi-commercial-v1.yaml`);
      expect(sitemapXml).toContain(acquisitionAbs);

      const robotsTxt = await (await fetch("http://127.0.0.1:34100/robots.txt")).text();
      expect(robotsTxt).toContain(`${canonicalOrigin}/sitemap.xml`);
      expect(robotsTxt).toMatch(/Allow:\s*\//);

      const yamlText = await (
        await fetch("http://127.0.0.1:34100/openapi-commercial-v1.yaml")
      ).text();
      const integrateUrl = `${canonicalOrigin}/integrate`;
      const selfServed = `${o}/openapi-commercial-v1.yaml`;
      const doc = parse(yamlText) as Record<string, unknown>;

      expect(doc.openapi).toBe("3.0.3");
      expect("externalDocs" in doc).toBe(true);
      const ext = doc.externalDocs as { description?: string; url?: string };
      expect(ext.description).toBe("First-run integration guide");
      const info = doc.info as Record<string, unknown>;
      expect("externalDocs" in info).toBe(false);
      expect(normalize(String(ext.url))).toBe(normalize(integrateUrl));
      expect(normalize(String((info.contact as { url: string }).url))).toBe(canonicalOrigin);
      expect(new RegExp("^\\s*url:\\s*" + escapeRegExp(o) + "\\s*$", "m").test(yamlText)).toBe(
        true,
      );
      expect(yamlText.includes("example.invalid")).toBe(false);

      const dist = info["x-agentskeptic-distribution"] as Record<string, string>;
      expect(Object.keys(dist).sort()).toEqual(["npmPackage", "openApi", "repository"]);
      expect(String(dist.repository)).toBe(a.gitRepositoryUrl);
      expect(String(dist.npmPackage)).toBe(a.npmPackageUrl);
      expect(normalize(String(dist.openApi))).toBe(normalize(selfServed));
    }, 180_000);

    afterAll(async () => {
      if (!child) return;
      const proc = child;

      async function waitClose(ms: number): Promise<void> {
        if (proc.exitCode !== null || proc.signalCode !== null) return;
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => {
            proc.off("close", onClose);
            reject(new Error("distribution-graph: wait for process close timed out"));
          }, ms);
          const onClose = () => {
            clearTimeout(t);
            resolve();
          };
          proc.once("close", onClose);
        });
      }

      proc.kill("SIGTERM");
      try {
        await waitClose(20_000);
        return;
      } catch {
        /* Next may ignore or delay SIGTERM; escalate */
      }

      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill("SIGKILL");
        try {
          await waitClose(10_000);
        } catch {
          throw new Error("distribution-graph: next start did not exit");
        }
      }
    });

    it("suite setup completed in beforeAll", () => {
      expect(true).toBe(true);
    });
  },
);
