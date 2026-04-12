"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const PLACEHOLDER_KEYS = [
  ["{{ORIGIN}}", "ORIGIN"],
  ["{{ACQUISITION_PATH}}", "ACQUISITION_PATH"],
  ["{{HERO_TITLE}}", "HERO_TITLE"],
  ["{{HERO_SUBTITLE}}", "HERO_SUBTITLE"],
  ["{{VISITOR_PROBLEM_ANSWER}}", "VISITOR_PROBLEM_ANSWER"],
  ["{{TERMINAL_TITLE}}", "TERMINAL_TITLE"],
  ["{{TERMINAL_TRANSCRIPT}}", "TERMINAL_TRANSCRIPT"],
];

/**
 * @param {string} root
 */
function discoveryPaths(root) {
  return {
    jsonPath: join(root, "config", "discovery-acquisition.json"),
    schemaPath: join(root, "config", "discovery-acquisition.schema.json"),
  };
}

/**
 * @param {string} root
 */
function loadDiscoveryAcquisition(root) {
  const { jsonPath } = discoveryPaths(root);
  return JSON.parse(readFileSync(jsonPath, "utf8"));
}

/**
 * @param {Record<string, unknown>} discovery
 * @param {string} originNormalized
 */
function buildDiscoveryFoldBody(discovery, originNormalized) {
  const slug = String(discovery.slug);
  const demo = /** @type {{ title: string; transcript: string }} */ (discovery.shareableTerminalDemo);
  const map = {
    "{{ORIGIN}}": originNormalized,
    "{{ACQUISITION_PATH}}": slug,
    "{{HERO_TITLE}}": String(discovery.heroTitle),
    "{{HERO_SUBTITLE}}": String(discovery.heroSubtitle),
    "{{VISITOR_PROBLEM_ANSWER}}": String(discovery.visitorProblemAnswer),
    "{{TERMINAL_TITLE}}": String(demo.title),
    "{{TERMINAL_TRANSCRIPT}}": String(demo.transcript),
  };
  const lines = discovery.readmeFold.templateLines.map((line) => substituteTemplateLine(String(line), map));
  const body = lines.join("\n");
  const label = String(discovery.homepageAcquisitionCtaLabel);
  const mdLink = `\n\n[${escapeMdLinkText(label)}](${originNormalized}${slug})`;
  const full = body + mdLink;
  const urlInParens = `(${originNormalized}${slug})`;
  if (!full.includes(urlInParens)) {
    throw new Error("discovery-acquisition: fold body must include markdown URL in parentheses");
  }
  return full;
}

/**
 * @param {string} line
 * @param {Record<string, string>} map
 */
function substituteTemplateLine(line, map) {
  let out = line;
  for (const [token, _] of PLACEHOLDER_KEYS) {
    if (out.includes(token) && map[token] !== undefined) {
      out = out.split(token).join(map[token]);
    }
  }
  if (out.includes("{{")) {
    throw new Error(`discovery-acquisition: unresolved placeholder in template line: ${line}`);
  }
  return out;
}

/**
 * @param {string} s
 */
function escapeMdLinkText(s) {
  return s.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/**
 * @param {Record<string, unknown>} discovery
 */
function validateIndexableGuides(discovery) {
  const guides = /** @type {{ path: string; navLabel: string; problemAnchor: string }[]} */ (
    discovery.indexableGuides
  );
  if (!Array.isArray(guides)) {
    throw new Error("discovery-acquisition: indexableGuides must be an array");
  }
  const paths = guides.map((g) => String(g.path));
  const uniq = new Set(paths);
  if (uniq.size !== paths.length) {
    throw new Error("discovery-acquisition: indexableGuides paths must be unique");
  }
  const demandMoments = /** @type {string[]} */ (discovery.demandMoments);
  for (let k = 0; k < guides.length; k++) {
    const pa = String(guides[k].problemAnchor);
    if (pa.includes("`")) {
      throw new Error("discovery-acquisition: problemAnchor must not contain backtick");
    }
    if (k >= 1) {
      const dm = String(demandMoments[k - 1]);
      if (!dm.includes(pa)) {
        throw new Error(
          `discovery-acquisition: indexableGuides[${k}].problemAnchor must be a substring of demandMoments[${k - 1}]`,
        );
      }
    }
  }
}

/**
 * @param {Record<string, unknown>} discovery
 */
function validateIndexableExamples(discovery) {
  const ex = /** @type {{ path: string; navLabel: string; problemAnchor: string; embedKey: string }[]} */ (
    discovery.indexableExamples
  );
  if (!Array.isArray(ex)) {
    throw new Error("discovery-acquisition: indexableExamples must be an array");
  }
  if (ex.length !== 2) {
    throw new Error("discovery-acquisition: indexableExamples must have length exactly 2");
  }
  if (ex[0].path !== "/examples/wf-complete" || ex[1].path !== "/examples/wf-missing") {
    throw new Error(
      "discovery-acquisition: indexableExamples paths must be /examples/wf-complete then /examples/wf-missing",
    );
  }
  if (ex[0].embedKey !== "wf_complete" || ex[1].embedKey !== "wf_missing") {
    throw new Error(
      "discovery-acquisition: indexableExamples embedKey order must be wf_complete then wf_missing",
    );
  }
  for (let i = 0; i < ex.length; i++) {
    const row = ex[i];
    const nl = String(row.navLabel);
    const pa = String(row.problemAnchor);
    if (nl.includes("`") || pa.includes("`")) {
      throw new Error(`discovery-acquisition: indexableExamples[${i}] must not contain backtick`);
    }
  }
}

/**
 * @param {string} baseLlms
 * @param {Record<string, unknown>} discovery
 * @param {string} canonicalOrigin
 */
function appendDiscoveryLlmsAppendix(baseLlms, discovery, canonicalOrigin) {
  const slug = String(discovery.slug);
  const origin = canonicalOrigin;
  const llms = discovery.llms;
  const bullets = (/** @type {string[]} */ arr) => arr.map((x) => `- ${x}`).join("\n");

  let out = String(baseLlms).replace(/\s*$/, "") + "\n";
  const guides = /** @type {{ path: string }[] | undefined} */ (discovery.indexableGuides);
  if (Array.isArray(guides) && guides.length > 0) {
    out += "\n## Indexable guides\n";
    for (const g of guides) {
      out += `- ${origin}${String(g.path)}\n`;
    }
  }
  const examples = /** @type {{ path: string }[] | undefined} */ (discovery.indexableExamples);
  if (Array.isArray(examples) && examples.length > 0) {
    out += "\n## Indexable examples\n";
    for (const ex of examples) {
      out += `- ${origin}${String(ex.path)}\n`;
    }
  }
  const demo = discovery.shareableTerminalDemo;
  if (demo && typeof demo.title === "string" && typeof demo.transcript === "string") {
    out += `\n## ${demo.title}\n\n\`\`\`text\n${demo.transcript}\n\`\`\`\n`;
  }
  out += "\n## Intent phrases\n";
  out += bullets(llms.intentPhrases) + "\n";
  out += "\n## Not for\n";
  out += bullets(llms.notFor) + "\n";
  out += "\n## Related queries\n";
  out += bullets(llms.relatedQueries) + "\n";
  const moments = /** @type {string[]} */ (discovery.demandMoments);
  out += "\n## When this hurts (search-shaped)\n";
  out += bullets(moments) + "\n";
  out += "\n## Problem framing (shareable)\n";
  out += `- Full page: ${origin}${slug}\n`;
  out += "\n## Visitor problem (canonical answer)\n\n";
  out += String(discovery.visitorProblemAnswer) + "\n";
  return out;
}

/**
 * @param {string} root
 */
function validateDiscoveryAcquisition(root) {
  const { jsonPath, schemaPath } = discoveryPaths(root);
  const discovery = JSON.parse(readFileSync(jsonPath, "utf8"));
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(discovery)) {
    const msg = ajv.errorsText(validate.errors, { separator: "\n" });
    throw new Error(`discovery-acquisition: schema validation failed:\n${msg}`);
  }
  const anchorsPath = join(root, "config", "public-product-anchors.json");
  const anchors = JSON.parse(readFileSync(anchorsPath, "utf8"));
  const { normalize } = require("./public-product-anchors.cjs");
  const origin = normalize(anchors.productionCanonicalOrigin);
  buildDiscoveryFoldBody(discovery, origin);
  const demo = discovery.shareableTerminalDemo;
  if (demo && String(demo.transcript).includes("```")) {
    throw new Error(
      "discovery-acquisition: shareableTerminalDemo.transcript must not contain markdown fence ```",
    );
  }
  validateIndexableGuides(discovery);
  validateIndexableExamples(discovery);
  return discovery;
}

module.exports = {
  loadDiscoveryAcquisition,
  buildDiscoveryFoldBody,
  appendDiscoveryLlmsAppendix,
  validateDiscoveryAcquisition,
  validateIndexableGuides,
  validateIndexableExamples,
  discoveryPaths,
};
