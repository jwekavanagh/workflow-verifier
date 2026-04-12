#!/usr/bin/env node
/**
 * Ensures commercial dist embeds LICENSE_API_BASE_URL in dist/generated/commercialBuildFlags.js,
 * then npm pack succeeds. Uses COMMERCIAL_LICENSE_API_BASE_URL when set (trimmed); else https://smoke.example.com.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = (process.env.COMMERCIAL_LICENSE_API_BASE_URL ?? "https://smoke.example.com").trim();
process.env.WF_BUILD_PROFILE = "commercial";
process.env.COMMERCIAL_LICENSE_API_BASE_URL = url;

const b = spawnSync(process.execPath, [path.join(root, "scripts", "build-commercial.mjs")], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, WF_BUILD_PROFILE: "commercial", COMMERCIAL_LICENSE_API_BASE_URL: url },
});
if (b.status !== 0) process.exit(b.status ?? 1);

const flagsJs = path.join(root, "dist", "generated", "commercialBuildFlags.js");
const src = readFileSync(flagsJs, "utf8");
const needle = JSON.stringify(url);
if (!src.includes(needle)) {
  console.error(
    "pack-smoke-commercial: dist/generated/commercialBuildFlags.js missing embedded LICENSE_API_BASE_URL",
  );
  console.error(`expected substring: ${needle}`);
  process.exit(1);
}

const dir = mkdtempSync(path.join(tmpdir(), "wfv-pack-"));
const p = spawnSync("npm", ["pack", "--pack-destination", dir], { cwd: root, shell: true });
if (p.status !== 0) {
  console.error("npm pack failed", p.stderr?.toString() || p.stdout?.toString() || "");
  process.exit(1);
}
console.log("pack-smoke-commercial: ok");
rmSync(dir, { recursive: true, force: true });
