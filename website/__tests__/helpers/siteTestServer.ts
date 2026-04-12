import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { afterAll } from "vitest";
import { getRepoRoot, loadAnchors } from "./distributionGraphHelpers";

const require = createRequire(import.meta.url);
const { normalize } = require("../../../scripts/public-product-anchors.cjs") as {
  normalize: (s: string) => string;
};

let child: ChildProcess | undefined;
let startPromise: Promise<void> | null = null;
let teardownRegistered = false;

async function waitUntilReady(): Promise<void> {
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch("http://127.0.0.1:34100/");
      if (res.status === 200) return;
    } catch {
      /* retry */
    }
  }
  throw new Error("siteTestServer: next start did not become ready on 127.0.0.1:34100");
}

async function startInternal(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("siteTestServer: DATABASE_URL is required (run website Vitest with commercial env)");
  }
  const anchors0 = loadAnchors();
  process.env.NEXT_PUBLIC_APP_URL = normalize(anchors0.productionCanonicalOrigin);
  process.env.VERCEL_ENV = "production";

  const repoRoot = getRepoRoot();
  execSync("npm run sync:public-product-anchors", {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    shell: true,
  });

  execSync("npm run build", {
    cwd: join(repoRoot, "website"),
    env: process.env,
    stdio: "inherit",
    shell: true,
  });

  const websiteDir = join(repoRoot, "website");
  const requireWebsite = createRequire(join(websiteDir, "package.json"));
  const nextBin = join(dirname(requireWebsite.resolve("next/package.json")), "dist", "bin", "next");
  if (!existsSync(nextBin)) {
    throw new Error(`siteTestServer: Next.js CLI missing at ${nextBin}`);
  }

  child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", "34100"], {
    cwd: websiteDir,
    env: process.env,
    stdio: "ignore",
    detached: false,
  });

  await waitUntilReady();
}

/** Idempotent: first Vitest file awaits full start; later files reuse the same server. */
export async function ensureMarketingSiteRunning(): Promise<void> {
  if (!startPromise) {
    startPromise = startInternal();
  }
  await startPromise;
}

/** Call once at module top level in each test file that uses `getSiteHtml` / `ensureMarketingSiteRunning`. */
export function registerMarketingSiteTeardown(): void {
  if (teardownRegistered) return;
  teardownRegistered = true;
  afterAll(async () => {
    if (!child) return;
    const proc = child;
    async function waitClose(ms: number): Promise<void> {
      if (proc.exitCode !== null || proc.signalCode !== null) return;
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => {
          proc.off("close", onClose);
          reject(new Error("siteTestServer: wait for process close timed out"));
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
      /* escalate */
    }
    if (proc.exitCode === null && proc.signalCode === null) {
      proc.kill("SIGKILL");
      await waitClose(10_000);
    }
  });
}

export async function getSiteHtml(path: string): Promise<string> {
  await ensureMarketingSiteRunning();
  const url = path.startsWith("http") ? path : `http://127.0.0.1:34100${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url);
  return res.text();
}
