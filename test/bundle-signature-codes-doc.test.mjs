/**
 * SSOT: every BUNDLE_SIGNATURE_* string in bundleSignatureCodes.ts appears in workflow-verifier.md.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as codes from "../dist/bundleSignatureCodes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const docPath = join(root, "docs", "workflow-verifier.md");

describe("bundle signature codes vs docs", () => {
  it("each exported BUNDLE_SIGNATURE_* value is verbatim in workflow-verifier.md", () => {
    const doc = readFileSync(docPath, "utf8");
    for (const [name, value] of Object.entries(codes)) {
      if (!/^BUNDLE_SIGNATURE_/.test(name)) continue;
      assert.ok(typeof value === "string", `${name} must be a string`);
      assert.ok(
        doc.includes(value),
        `docs/workflow-verifier.md must include canonical code string ${value} (${name})`,
      );
    }
  });
});
