import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lib = require(join(root, "scripts", "discovery-acquisition.lib.cjs"));
const { normalize } = require(join(root, "scripts", "public-product-anchors.cjs"));
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

test("discovery JSON validates against schema", () => {
  lib.validateDiscoveryAcquisition(root);
});

test("README discovery fold body matches buildDiscoveryFoldBody", () => {
  const discovery = lib.loadDiscoveryAcquisition(root);
  const anchors = JSON.parse(readFileSync(join(root, "config", "public-product-anchors.json"), "utf8"));
  const origin = normalize(anchors.productionCanonicalOrigin);
  const expected = lib.buildDiscoveryFoldBody(discovery, origin);
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const start = "<!-- discovery-acquisition-fold:start -->";
  const end = "<!-- discovery-acquisition-fold:end -->";
  const i0 = readme.indexOf(start);
  const i1 = readme.indexOf(end);
  assert.ok(i0 >= 0 && i1 > i0);
  const inner = readme.slice(i0 + start.length, i1).trim();
  assert.equal(inner, expected.trim());
});

test("README discovery-readme-title matches readmeTitle", () => {
  const discovery = lib.loadDiscoveryAcquisition(root);
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const tStart = "<!-- discovery-readme-title:start -->";
  const tEnd = "<!-- discovery-readme-title:end -->";
  const i0 = readme.indexOf(tStart);
  const i1 = readme.indexOf(tEnd);
  assert.ok(i0 >= 0 && i1 > i0);
  const inner = readme.slice(i0 + tStart.length, i1).trim();
  assert.equal(inner, `# ${discovery.readmeTitle}`);
});

test("invalid visitorProblemAnswer fails schema (negative)", () => {
  const schemaPath = join(root, "config", "discovery-acquisition.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const bad = {
    schemaVersion: 1,
    slug: "/database-truth-vs-traces",
    visitorProblemAnswer: "x".repeat(50),
    heroTitle: "t",
    heroSubtitle: "t",
    homepageAcquisitionCtaLabel: "1234567890",
    pageMetadata: { title: "t", description: "t" },
    sections: [
      { heading: "a", paragraphs: ["p"] },
      { heading: "b", paragraphs: ["p"] },
      { heading: "c", paragraphs: ["p"] },
      { heading: "d", paragraphs: ["p"] },
    ],
    llms: {
      intentPhrases: ["1", "2", "3", "4", "5"],
      notFor: ["1", "2", "3"],
      relatedQueries: ["1", "2", "3", "4", "5"],
    },
    readmeFold: { templateLines: ["x"] },
  };
  assert.equal(validate(bad), false);
});
