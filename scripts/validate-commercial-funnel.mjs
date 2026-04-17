#!/usr/bin/env node
/**
 * Layer 1 commercial validation + optional Layer 2 (Playwright).
 * Always runs pack-smoke (commercial build + npm pack) then restores OSS `dist/` via `npm run build`.
 * Set COMMERCIAL_LICENSE_API_BASE_URL for pack-smoke (defaults to https://pack-smoke.example.com).
 * Writes artifacts/commercial-validation-verdict.json
 *
 * Website step: `DATABASE_URL` / `TELEMETRY_DATABASE_URL` must be disposable local Postgres (see
 * assert-destructive-postgres-urls). `NEXT_PUBLIC_APP_URL` is set to the committed canonical public
 * origin so locally built HTML matches distribution SSOT; page requests in Vitest are still only to
 * `http://127.0.0.1:34100` (see website/__tests__/helpers/siteTestServer.ts). Vitest refuses fetches
 * to that canonical host unless AGENTSKEPTIC_ALLOW_PUBLIC_ORIGIN_FETCH=1.
 *
 * Only one validate-commercial-funnel process may run per repo checkout at a time (PID lock file under
 * artifacts/). Concurrent runs cause Next.js “Another next build process is already running” failures.
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { destructivePostgresUrlViolations } from "./assert-destructive-postgres-urls.mjs";

const require = createRequire(import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, "artifacts");
const verdictPath = path.join(artifactDir, "commercial-validation-verdict.json");
const validateCommercialLockPath = path.join(artifactDir, "validate-commercial.lock");

function acquireValidateCommercialLock() {
  mkdirSync(artifactDir, { recursive: true });
  if (existsSync(validateCommercialLockPath)) {
    const raw = readFileSync(validateCommercialLockPath, "utf8").trim();
    const holderPid = Number(String(raw).split(/\s+/)[0]);
    if (Number.isFinite(holderPid) && holderPid > 0) {
      try {
        process.kill(holderPid, 0);
        console.error(
          JSON.stringify({
            kind: "validate_commercial_lock_busy",
            holderPid,
            lockPath: validateCommercialLockPath,
            message:
              "Another validate-commercial-funnel process is running on this checkout. Wait for it to finish before starting a second npm run validate-commercial.",
          }),
        );
        process.exit(1);
      } catch {
        /* stale lock — holder process does not exist */
      }
    }
    try {
      unlinkSync(validateCommercialLockPath);
    } catch {
      /* ignore */
    }
  }
  writeFileSync(validateCommercialLockPath, `${process.pid}\n`, "utf8");
}

function releaseValidateCommercialLock() {
  try {
    if (!existsSync(validateCommercialLockPath)) return;
    const holder = readFileSync(validateCommercialLockPath, "utf8").trim().split(/\s+/)[0];
    if (holder === String(process.pid)) {
      unlinkSync(validateCommercialLockPath);
    }
  } catch {
    /* ignore */
  }
}

process.on("exit", releaseValidateCommercialLock);

acquireValidateCommercialLock();

/** Merge `website/.env` into `process.env` when keys are unset (local dev); CI keeps explicit env. */
function mergeWebsiteDotenv() {
  const p = path.join(root, "website", ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

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

mergeWebsiteDotenv();

if (!process.env.DATABASE_URL?.trim()) {
  console.error(
    "validate-commercial-funnel: DATABASE_URL is required (Postgres; drizzle migrate runs before website Vitest).",
  );
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (!process.env.TELEMETRY_DATABASE_URL?.trim()) {
  console.error(
    "validate-commercial-funnel: TELEMETRY_DATABASE_URL is required (telemetry drizzle migrate + website Vitest).",
  );
  writeVerdict("not_solved", layers);
  process.exit(1);
}

const destructiveUrlViolations = destructivePostgresUrlViolations(
  [
    { name: "DATABASE_URL", raw: process.env.DATABASE_URL },
    { name: "TELEMETRY_DATABASE_URL", raw: process.env.TELEMETRY_DATABASE_URL },
  ],
  process.env,
);
if (destructiveUrlViolations.length > 0) {
  console.error(`validate-commercial-funnel: ${destructiveUrlViolations.join("\n")}`);
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (
  !run(process.execPath, [path.join(root, "scripts", "core-database-boundary-preflight.mjs")])
) {
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
websiteTestEnv.TELEMETRY_DATABASE_URL = process.env.TELEMETRY_DATABASE_URL;
websiteTestEnv.AGENTSKEPTIC_TELEMETRY_WRITES_TELEMETRY_DB = "1";

if (!run(process.execPath, ["scripts/db-migrate.mjs"], { cwd: websiteDir, env: websiteTestEnv })) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (!run(process.execPath, ["scripts/db-migrate-telemetry.mjs"], { cwd: websiteDir, env: websiteTestEnv })) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (!run(process.execPath, ["--test", path.join(root, "test", "post-product-activation-install-id.test.mjs")])) {
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

if (
  !run(
    "npx",
    ["vitest", "run", "--exclude", "**/telemetry-daily-pack-*.test.ts"],
    { cwd: websiteDir, shell: true, env: websiteTestEnv },
  )
) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (
  !run(
    "npx",
    [
      "vitest",
      "run",
      "__tests__/telemetry-daily-pack-sql-contract.test.ts",
      "__tests__/telemetry-daily-pack-export.integration.test.ts",
    ],
    { cwd: websiteDir, shell: true, env: websiteTestEnv },
  )
) {
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

// BUILD:postPackSmokeOssRestore
// PHASE:postPackSmokeOssRestoreBuild
if (!run("npm", ["run", "build"], { shell: true })) {
  writeVerdict("not_solved", layers);
  process.exit(1);
}

if (!runRegistryDraftOutcomeHarness(root)) {
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

/**
 * REGISTRY_DRAFT_OUTCOME_HARNESS — root `node:test` proofs (see docs/registry-draft-ssot.md).
 * Must run only after OSS `dist/` restore (`PHASE:postPackSmokeOssRestoreBuild` above).
 */
function runRegistryDraftOutcomeHarness(r) {
  // REGISTRY_DRAFT_OUTCOME_HARNESS
  const tests = [
    "test/validate-commercial-funnel-registry-draft-harness.test.mjs",
    "test/registry-draft-contract.test.mjs",
    "test/registry-draft-outcome-chain-import-guard.test.mjs",
    "test/registry-draft-outcome-chain.test.mjs",
  ];
  for (const rel of tests) {
    if (!run(process.execPath, ["--test", path.join(r, rel)])) {
      return false;
    }
  }
  return true;
}

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
