/* Sole node:test entry for quick-param-pointer CI gates. package.json test:node:sqlite must list test/quick-param-pointer.gates.test.mjs only (not the deleted per-suite filenames). */
/**
 * I0 gate: committed pointer-promotion fixture exists and matches golden path list.
 * I1 gate: Quick Verify spec surface locked to 1.2.0 on four files + normative A.13 golden.
 * I8: normative + product SSOT mention predicate once; normative includes merge golden; README link + forbidden strings.
 * I9: Vitest negatives, then DB path guard, then no-provider-imports (single node:test entrypoint).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertQuickParamPointerDbPaths } from "./quick-param-pointer-db-path-guard.lib.mjs";
import { assertNoProviderImportsInQuickVerify } from "./quick-param-pointer-no-provider-imports.lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function countSubstring(haystack, needle) {
  let c = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    c++;
    i += needle.length;
  }
  return c;
}

describe("quick-param-pointer fixtures present", () => {
  it("fixture sqlite exists and paths match golden", () => {
    const golden = JSON.parse(
      readFileSync(join(root, "test/golden/quick-param-pointer/v1/fixture-paths.json"), "utf8"),
    );
    assert.ok(Array.isArray(golden));
    assert.deepEqual(golden, ["test/fixtures/quick-param-pointer/pointer-promotion.sqlite"]);
    for (const rel of golden) {
      const abs = join(root, rel);
      statSync(abs);
    }
  });
});

describe("quick-param-pointer version 1.2.0 surfaces", () => {
  it("quickVerifyScope.ts", () => {
    const text = readFileSync(join(root, "src/quickVerify/quickVerifyScope.ts"), "utf8");
    assert.ok(/^export const QUICK_VERIFY_VERSION = "1\.2\.0" as const;$/m.test(text));
    assert.equal(/QUICK_VERIFY_VERSION = "1.1.0"/.test(text), false);
  });

  it("quick-verify-report.schema.json", () => {
    const utf8 = readFileSync(join(root, "schemas/quick-verify-report.schema.json"), "utf8");
    const parsed = JSON.parse(utf8);
    assert.strictEqual(parsed.properties.scope.properties.quickVerifyVersion.const, "1.2.0");
  });

  it("quick-verify-normative.md A.13 + no 1.1.0", () => {
    const normative = readFileSync(join(root, "docs/quick-verify-normative.md"), "utf8");
    const lines = normative.split(/\r?\n/);
    assert.strictEqual(
      lines[2],
      "**Spec id:** `quick-verify-spec` **version:** `1.2.0`",
    );
    const goldenRaw = readFileSync(
      join(root, "test/golden/quick-param-pointer/v1/version-surface/normative-lines-172-173-1-2-0.txt"),
      "utf8",
    );
    const golden = goldenRaw.replace(/\r?\n$/, "");
    assert.strictEqual(lines.slice(171, 173).join("\n"), golden);
    assert.equal(normative.includes("1.1.0"), false);
  });

  it("quick-verify.sqlite.test.mjs literals", () => {
    const text = readFileSync(join(root, "test/quick-verify.sqlite.test.mjs"), "utf8");
    assert.ok(text.includes("assert.equal(report.scope.quickVerifyVersion, \"1.2.0\");"));
    assert.strictEqual(/quickVerifyVersion[^\n]*1\.1\.0/.test(text), false);
  });
});

describe("docs quick-param-pointer SSOT", () => {
  it("normative + product + README contracts", () => {
    const normative = readFileSync(join(root, "docs/quick-verify-normative.md"), "utf8");
    const product = readFileSync(join(root, "docs/verification-product-ssot.md"), "utf8");
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const needle = "eligible_export_sql_row_param_pointer";
    assert.strictEqual(countSubstring(normative, needle), 1);
    assert.strictEqual(
      countSubstring(product, needle),
      0,
      "verification-product-ssot.md must not name implementation predicates; see quick-verify-normative + operational notes",
    );
    const merge = readFileSync(
      join(root, "test/golden/quick-param-pointer/v1/normative-merge-section.md"),
      "utf8",
    ).trim();
    assert.strictEqual(normative.replace(/\r\n/g, "\n").includes(merge), true);
    const plain = "[docs/verification-product-ssot.md](docs/verification-product-ssot.md)";
    const bold = "[`docs/verification-product-ssot.md`](docs/verification-product-ssot.md)";
    assert.ok(countSubstring(readme, plain) + countSubstring(readme, bold) >= 1);
    const forbidden = [
      "eligible_export_sql_row_param_pointer",
      "normalizedSqlRowRequestFingerprint",
      "buildSyntheticRowParams",
      "test/fixtures/quick-param-pointer",
    ];
    for (const f of forbidden) {
      assert.strictEqual(countSubstring(readme, f), 0, `README must not contain ${f}`);
    }
  });
});

describe("quick-param-pointer i9 gate", () => {
  it("runs negatives, db-path guard, no-provider guard", () => {
    const v = spawnSync("npm run test:vitest -- src/quickVerify/quickParamPointerNegatives.test.ts", {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
    assert.strictEqual(v.status, 0);
    assertQuickParamPointerDbPaths(root);
    assertNoProviderImportsInQuickVerify(root);
  });
});
