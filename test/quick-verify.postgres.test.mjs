/**
 * Quick Verify against Postgres (contacts seed from pg-ci-init).
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { runQuickVerify } from "../dist/quickVerify/runQuickVerify.js";
import { loadSchemaValidator } from "../dist/schemaLoad.js";
import { DEFAULT_QUICK_VERIFY_PRODUCT_TRUTH } from "../dist/quickVerify/quickVerifyProductTruth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const passLine = readFileSync(join(root, "test", "fixtures", "quick-verify", "pass-line.ndjson"), "utf8");

const verifyUrl = process.env.POSTGRES_VERIFICATION_URL;

describe("Quick Verify Postgres", () => {
  before(() => {
    assert.ok(verifyUrl && verifyUrl.length > 0, "POSTGRES_VERIFICATION_URL must be set");
  });

  it("runQuickVerify passes", async () => {
    const { report } = await runQuickVerify({
      inputUtf8: passLine,
      postgresUrl: verifyUrl,
    });
    assert.equal(report.schemaVersion, 4);
    assert.deepEqual(report.productTruth, DEFAULT_QUICK_VERIFY_PRODUCT_TRUTH);
    assert.equal(report.verdict, "pass");
    const v = loadSchemaValidator("quick-verify-report");
    assert.ok(v(report), JSON.stringify(v.errors ?? []));
  });
});
