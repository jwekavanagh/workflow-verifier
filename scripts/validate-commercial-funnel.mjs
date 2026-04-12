#!/usr/bin/env node
/**
 * Layer 1 commercial validation + optional Layer 2 (Playwright).
 * Always runs pack-smoke (commercial build + npm pack) then restores OSS `dist/` via `npm run build`.
 * Set COMMERCIAL_LICENSE_API_BASE_URL for pack-smoke (defaults to https://pack-smoke.example.com).
 * Writes artifacts/commercial-validation-verdict.json
 */
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, "artifacts");
const verdictPath = path.join(artifactDir, "commercial-validation-verdict.json");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? root,
    stdio: "inherit",
    shell: opts.shell ?? false,
    env: { ...process.env, ...opts.env },
  });
  return r.status === 0;
}

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const layers = { regression: false, funnel: false };

if (!run(process.execPath, ["scripts/check-commercial-plans-ssot.mjs"])) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (!run("npm", ["run", "build"], { shell: true })) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (!run("npx", ["vitest", "run", "src/commercial/licensePreflight.test.ts"], { shell: true })) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

layers.regression = true;

if (!process.env.DATABASE_URL?.trim()) {
  console.error(
    "validate-commercial-funnel: DATABASE_URL is required (Postgres; drizzle-kit migrate runs before website Vitest).",
  );
  writeVerdict("not_solved", layers);
  process.exit(1);
}

const websiteDir = path.join(root, "website");
const anchorsRaw = readFileSync(path.join(root, "config", "public-product-anchors.json"), "utf8");
const anchors = JSON.parse(anchorsRaw);
const { normalize } = require("./public-product-anchors.cjs");

const websiteTestEnv = {
  ...process.env,
  CONTACT_SALES_EMAIL: process.env.CONTACT_SALES_EMAIL ?? "sales-ci@example.com",
  AUTH_SECRET:
    process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32
      ? process.env.AUTH_SECRET
      : "x".repeat(40),
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_placeholder",
  STRIPE_PRICE_INDIVIDUAL: process.env.STRIPE_PRICE_INDIVIDUAL ?? "price_individual_placeholder",
  STRIPE_PRICE_TEAM: process.env.STRIPE_PRICE_TEAM ?? "price_team_placeholder",
  STRIPE_PRICE_BUSINESS: process.env.STRIPE_PRICE_BUSINESS ?? "price_business_placeholder",
};

websiteTestEnv.NEXT_PUBLIC_APP_URL = normalize(anchors.productionCanonicalOrigin);
websiteTestEnv.VERCEL_ENV = "production";

if (!run("npx", ["drizzle-kit", "migrate"], { cwd: websiteDir, shell: true, env: websiteTestEnv })) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (!run(process.execPath, ["--test", path.join(root, "test", "visitor-problem-outcome.test.mjs")])) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (!run(process.execPath, ["--test", path.join(root, "test", "registry-metadata-parity.test.mjs")])) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (!run("npx", ["vitest", "run"], { cwd: websiteDir, shell: true, env: websiteTestEnv })) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (!run(process.execPath, ["scripts/check-web-demo-prereqs.mjs"])) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

const packSmokeUrl =
  process.env.COMMERCIAL_LICENSE_API_BASE_URL?.trim() || "https://pack-smoke.example.com";
if (
  !run(process.execPath, ["scripts/pack-smoke-commercial.mjs"], {
    env: {
      ...process.env,
      COMMERCIAL_LICENSE_API_BASE_URL: packSmokeUrl,
    },
  })
) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (!run("npm", ["run", "build"], { shell: true })) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (process.env.COMMERCIAL_VALIDATE_PLAYWRIGHT === "1") {
  const pw = run("npx", ["playwright", "test", "-c", "playwright.commercial.config.ts"], {
    shell: true,
    env: process.env,
  });
  if (!pw) {
    writeVerdict("not_solved", layers);
    process.exit(1);
  }
  layers.funnel = true;
} else {
  layers.funnel = false;
}

const solved =
  layers.regression &&
  (process.env.COMMERCIAL_REQUIRE_LAYER2 === "1" ? layers.funnel : true);

writeVerdict(solved ? "solved" : "not_solved", layers);
process.exit(solved ? 0 : 1);

function writeVerdict(status, lyr) {
  mkdirSync(artifactDir, { recursive: true });
  const body = {
    schemaVersion: 1,
    status,
    provenBy: "validate-commercial-funnel.mjs",
    layers: lyr,
    commit: gitHead(),
    recordedAt: new Date().toISOString(),
  };
  writeFileSync(verdictPath, JSON.stringify(body, null, 2) + "\n", "utf8");
}
