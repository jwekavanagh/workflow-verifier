/**
 * Docs contract: SSOT headings order + README above-the-fold pins.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const contractPath = join(__dirname, "docs-contract-headings.json");
const readmeFunnelPath = join(__dirname, "readme-funnel-headings.json");
const { headings } = JSON.parse(readFileSync(contractPath, "utf8"));
const { headings: readmeFunnelHeadings } = JSON.parse(
  readFileSync(readmeFunnelPath, "utf8"),
);

describe("docs contract (SSOT + README)", () => {
  it("execution-truth-layer.md headings appear in committed order", () => {
    const ssot = readFileSync(join(root, "docs", "execution-truth-layer.md"), "utf8");
    let pos = 0;
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      const idx = ssot.indexOf(h, pos);
      assert.ok(idx >= 0, `missing or out-of-order heading: ${h}`);
      pos = idx + h.length;
    }
  });

  it("README conversion funnel: ordered sections + value + try path + success/failure signal", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    let pos = 0;
    for (let i = 0; i < readmeFunnelHeadings.length; i++) {
      const h = readmeFunnelHeadings[i];
      const idx = readme.indexOf(h, pos);
      assert.ok(idx >= 0, `missing or out-of-order README funnel heading: ${h}`);
      pos = idx + h.length;
    }
    const funnelSlice = readme.slice(0, pos + 1);
    assert.ok(
      /\*\*One-sentence value:\*\*/.test(funnelSlice),
      "explicit one-sentence value proposition before deep sections",
    );
    assert.ok(
      /npm start/.test(funnelSlice) && /npm install/.test(funnelSlice),
      "quickstart includes install and demo command",
    );
    assert.ok(
      /wf_complete/.test(funnelSlice) &&
        /wf_missing/.test(funnelSlice) &&
        /ROW_ABSENT/.test(funnelSlice),
      "sample output names success workflow, failure workflow, and absent-row signal",
    );
    assert.ok(
      /Interpretation:/i.test(funnelSlice) &&
        /safe to trust/i.test(funnelSlice) &&
        /inconsistent/i.test(funnelSlice),
      "sample output includes interpretation lines for success and failure",
    );
    assert.ok(
      /Canonical use case/i.test(funnelSlice) &&
        /CRM/i.test(funnelSlice) &&
        /support/i.test(funnelSlice),
      "canonical commercial use case (support/CRM) appears in funnel",
    );
    assert.ok(
      funnelSlice.includes("## Core workflow verification"),
      "core path is grouped under Core workflow verification",
    );
    assert.ok(
      /This is for you if/i.test(funnelSlice) && /This is not for you if/i.test(funnelSlice),
      "persona self-identification in funnel",
    );
    const afterFunnel = readme.slice(pos);
    assert.ok(
      afterFunnel.includes("## How this differs from logs, tests, and observability"),
      "differentiation lives after funnel, not before try path",
    );
    assert.ok(
      /Retries, partial failures/.test(readme) &&
        /read-only `SELECT`s/.test(readme) &&
        /what the tool calls said should be true/.test(readme),
      "README states verification mechanism and aligns value prop phrasing",
    );
  });
});
