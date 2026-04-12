/**
 * Every indexableGuides.path has a matching Next app route file.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

test("indexableGuides paths resolve to page.tsx under website/src/app/guides", () => {
  const discovery = JSON.parse(readFileSync(join(root, "config", "discovery-acquisition.json"), "utf8"));
  const guides = discovery.indexableGuides;
  assert.ok(Array.isArray(guides));
  for (const g of guides) {
    const seg = String(g.path).replace(/^\/guides\//, "");
    const pagePath = join(root, "website", "src", "app", "guides", seg, "page.tsx");
    assert.ok(existsSync(pagePath), `missing page for ${g.path}: ${pagePath}`);
  }
});

test("indexableExamples paths resolve to page.tsx under website/src/app/examples", () => {
  const discovery = JSON.parse(readFileSync(join(root, "config", "discovery-acquisition.json"), "utf8"));
  const examples = discovery.indexableExamples;
  assert.ok(Array.isArray(examples));
  for (const e of examples) {
    const seg = String(e.path).replace(/^\/examples\//, "");
    const pagePath = join(root, "website", "src", "app", "examples", seg, "page.tsx");
    assert.ok(existsSync(pagePath), `missing page for ${e.path}: ${pagePath}`);
  }
});
