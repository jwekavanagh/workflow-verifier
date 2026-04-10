import { spawn, execSync, execFileSync, type ChildProcess } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
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

      child = spawn("npm", ["run", "start", "--", "-H", "127.0.0.1", "-p", "34100"], {
        cwd: join(repoRoot, "website"),
        env: process.env,
        stdio: "pipe",
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

      const llmsText = await (await fetch("http://127.0.0.1:34100/llms.txt")).text();
      expect(llmsText).toContain(a.identityOneLiner);
      expect(llmsText).toContain(`${canonicalOrigin}/integrate`);
      expect(llmsText).toContain(`${canonicalOrigin}/openapi-commercial-v1.yaml`);
      expect(llmsText).toContain(a.gitRepositoryUrl);
      expect(llmsText).toContain(a.npmPackageUrl);
      expect(llmsText.includes("example.invalid")).toBe(false);

      const sitemapXml = await (await fetch("http://127.0.0.1:34100/sitemap.xml")).text();
      expect(sitemapXml).toContain(`${canonicalOrigin}/llms.txt`);
      expect(sitemapXml).toContain(`${canonicalOrigin}/integrate`);
      expect(sitemapXml).toContain(`${canonicalOrigin}/openapi-commercial-v1.yaml`);

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

      const dist = info["x-workflow-verifier-distribution"] as Record<string, string>;
      expect(Object.keys(dist).sort()).toEqual(["npmPackage", "openApi", "repository"]);
      expect(String(dist.repository)).toBe(a.gitRepositoryUrl);
      expect(String(dist.npmPackage)).toBe(a.npmPackageUrl);
      expect(normalize(String(dist.openApi))).toBe(normalize(selfServed));
    }, 180_000);

    afterAll(async () => {
      if (!child) return;
      child.kill("SIGTERM");
      await Promise.race([
        once(child, "close"),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("distribution-graph: next start did not exit")), 5000),
        ),
      ]);
    });

    it("suite setup completed in beforeAll", () => {
      expect(true).toBe(true);
    });
  },
);
