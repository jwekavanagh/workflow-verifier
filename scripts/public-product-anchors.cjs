"use strict";

const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { join, dirname } = require("node:path");

const ROOT = join(__dirname, "..");
const ANCHORS_PATH = join(ROOT, "config", "public-product-anchors.json");
const OPENAPI_IN = join(ROOT, "schemas", "openapi-commercial-v1.in.yaml");
const OPENAPI_OUT = join(ROOT, "schemas", "openapi-commercial-v1.yaml");
const OPENAPI_PUBLIC = join(ROOT, "website", "public", "openapi-commercial-v1.yaml");
const LLMS_PUBLIC = join(ROOT, "website", "public", "llms.txt");
const README_PATH = join(ROOT, "README.md");
const PKG_PATH = join(ROOT, "package.json");

const README_START = "<!-- public-product-anchors:start -->";
const README_END = "<!-- public-product-anchors:end -->";

const TOKENS = [
  "__IDENTITY_ONE_LINER__",
  "__DISTRIBUTION_CONTACT_URL__",
  "__DISTRIBUTION_INTEGRATE_URL__",
  "__DISTRIBUTION_REPO_URL__",
  "__DISTRIBUTION_NPM_URL__",
  "__OPENAPI_SELF_URL__",
  "__SERVERS_ORIGIN__",
];

/**
 * @param {string} s
 */
function normalize(s) {
  const t = String(s).trim();
  if (!t) throw new Error("normalize: empty origin");
  const u = new URL(t);
  return u.origin;
}

/**
 * @param {string} haystack
 * @param {string} needle
 */
function countOccurrences(haystack, needle) {
  let n = 0;
  let i = 0;
  while (true) {
    const j = haystack.indexOf(needle, i);
    if (j === -1) break;
    n++;
    i = j + needle.length;
  }
  return n;
}

function loadAnchors() {
  const raw = readFileSync(ANCHORS_PATH, "utf8");
  const anchors = JSON.parse(raw);
  const required = [
    "identityOneLiner",
    "productionCanonicalOrigin",
    "gitRepositoryUrl",
    "gitRepositoryGitUrl",
    "npmPackageUrl",
    "bugsUrl",
    "keywords",
  ];
  for (const k of required) {
    if (anchors[k] === undefined || anchors[k] === null) {
      throw new Error(`public-product-anchors: missing ${k}`);
    }
  }
  if (!Array.isArray(anchors.keywords) || anchors.keywords.length === 0) {
    throw new Error("public-product-anchors: keywords must be a non-empty array");
  }
  return anchors;
}

function validateAnchors() {
  loadAnchors();
  const template = readFileSync(OPENAPI_IN, "utf8");
  for (const tok of TOKENS) {
    const c = countOccurrences(template, tok);
    if (c !== 1) {
      throw new Error(`openapi template: token ${tok} must appear exactly once, found ${c}`);
    }
  }
}

function escapeYamlDoubleQuotedOneLiner(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Plain-text entry point for tools and agents (canonical URLs only).
 * @param {Record<string, unknown>} anchors
 * @param {string} canonicalOrigin normalized origin
 * @param {string} integrateUrl
 * @param {string} openapiSelfCanonical
 */
function buildLlmsText(anchors, canonicalOrigin, integrateUrl, openapiSelfCanonical) {
  const lines = [
    "# Workflow Verifier",
    "",
    "## Summary",
    String(anchors.identityOneLiner),
    "",
    "## Primary links",
    `- Canonical site: ${canonicalOrigin}/`,
    `- First-run integration: ${integrateUrl}`,
    `- OpenAPI (canonical): ${openapiSelfCanonical}`,
    `- Source repository: ${anchors.gitRepositoryUrl}`,
    `- npm package: ${anchors.npmPackageUrl}`,
    "",
  ];
  return lines.join("\n");
}

function assertNextPublicOriginParity() {
  const anchors = loadAnchors();
  const canonicalFromJson = anchors.productionCanonicalOrigin;
  const skip =
    process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
  if (!skip && normalize(process.env.NEXT_PUBLIC_APP_URL || "") !== normalize(canonicalFromJson)) {
    throw new Error("NEXT_PUBLIC_APP_URL must equal productionCanonicalOrigin");
  }
}

function syncPublicProductAnchors() {
  const anchors = loadAnchors();
  const template = readFileSync(OPENAPI_IN, "utf8");
  for (const tok of TOKENS) {
    const c = countOccurrences(template, tok);
    if (c !== 1) {
      throw new Error(`openapi template: token ${tok} must appear exactly once, found ${c}`);
    }
  }

  const escaped = escapeYamlDoubleQuotedOneLiner(anchors.identityOneLiner);
  const canonicalOrigin = normalize(anchors.productionCanonicalOrigin);
  const openapiSelfCanonical = `${canonicalOrigin}/openapi-commercial-v1.yaml`;

  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  const effectivePublicOrigin =
    typeof envUrl === "string" && envUrl.trim() ? envUrl.trim() : anchors.productionCanonicalOrigin;
  const publicOriginNormalized = normalize(effectivePublicOrigin);
  const openapiSelfEffective = `${publicOriginNormalized}/openapi-commercial-v1.yaml`;

  const integrateUrl = `${canonicalOrigin}/integrate`;

  let mid = template;
  mid = mid.replace("__IDENTITY_ONE_LINER__", escaped);
  mid = mid.replace("__DISTRIBUTION_CONTACT_URL__", canonicalOrigin);
  mid = mid.replace("__DISTRIBUTION_INTEGRATE_URL__", integrateUrl);
  mid = mid.replace("__DISTRIBUTION_REPO_URL__", anchors.gitRepositoryUrl);
  mid = mid.replace("__DISTRIBUTION_NPM_URL__", anchors.npmPackageUrl);

  const repoYaml = mid
    .replace("__SERVERS_ORIGIN__", canonicalOrigin)
    .replace("__OPENAPI_SELF_URL__", openapiSelfCanonical);
  writeFileSync(OPENAPI_OUT, repoYaml, "utf8");

  mkdirSync(dirname(OPENAPI_PUBLIC), { recursive: true });
  const publicYaml = mid
    .replace("__SERVERS_ORIGIN__", publicOriginNormalized)
    .replace("__OPENAPI_SELF_URL__", openapiSelfEffective);
  writeFileSync(OPENAPI_PUBLIC, publicYaml, "utf8");

  mkdirSync(dirname(LLMS_PUBLIC), { recursive: true });
  writeFileSync(
    LLMS_PUBLIC,
    buildLlmsText(anchors, canonicalOrigin, integrateUrl, openapiSelfCanonical),
    "utf8",
  );

  const pkgRaw = readFileSync(PKG_PATH, "utf8");
  const pkg = JSON.parse(pkgRaw);
  pkg.description = anchors.identityOneLiner;
  pkg.repository = { type: "git", url: anchors.gitRepositoryGitUrl };
  pkg.homepage = canonicalOrigin;
  pkg.bugs = { url: anchors.bugsUrl };
  pkg.keywords = anchors.keywords;
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n", "utf8");

  const readme = readFileSync(README_PATH, "utf8");
  if (!readme.includes(README_START) || !readme.includes(README_END)) {
    throw new Error("README.md must contain public-product-anchors markers");
  }
  const inner = [
    anchors.identityOneLiner,
    "",
    `- **Repository:** ${anchors.gitRepositoryUrl}`,
    `- **npm package:** ${anchors.npmPackageUrl}`,
    `- **Canonical site:** ${canonicalOrigin}`,
    `- **Integrate:** ${integrateUrl}`,
    `- **OpenAPI (canonical):** ${openapiSelfCanonical}`,
    `- **llms.txt (agents):** ${canonicalOrigin}/llms.txt`,
    "",
  ].join("\n");
  const block = `${README_START}\n${inner}\n${README_END}`;
  const re = new RegExp(
    `${README_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${README_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
  );
  if (!re.test(readme)) {
    throw new Error("README: could not match public-product-anchors region");
  }
  writeFileSync(README_PATH, readme.replace(re, block), "utf8");
}

function main() {
  validateAnchors();
  if (process.argv.includes("--check")) {
    return;
  }
  syncPublicProductAnchors();
}

module.exports = {
  validateAnchors,
  syncPublicProductAnchors,
  assertNextPublicOriginParity,
  normalize,
};

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
