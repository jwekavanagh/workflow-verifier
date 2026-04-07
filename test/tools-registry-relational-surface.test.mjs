/**
 * Structural key allowlists for sql_relational (must match schemas/tools-registry.schema.json).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSchemaValidator } from "../dist/schemaLoad.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const TOOL_KEYS = new Set(["toolId", "effectDescriptionTemplate", "verification"]);
const SQL_REL_KEYS = new Set(["kind", "checks"]);
const AGG_KEYS = new Set([
  "checkKind",
  "id",
  "table",
  "fn",
  "sumColumn",
  "whereEq",
  "expect",
]);
const JOIN_KEYS = new Set([
  "checkKind",
  "id",
  "leftTable",
  "rightTable",
  "join",
  "whereEq",
  "expect",
]);
const JOIN_INNER_KEYS = new Set(["leftColumn", "rightColumn"]);
const EXISTS_KEYS = new Set(["checkKind", "id", "childTable", "fkColumn", "fkValue", "whereEq"]);
const EXPECT_KEYS = new Set(["op", "value"]);
const WHERE_PLAIN_KEYS = new Set(["column", "value"]);
const WHERE_SIDE_KEYS = new Set(["tableSide", "column", "value"]);

function assertKeys(obj, allowed, label) {
  const keys = Object.keys(obj);
  for (const k of keys) {
    assert.ok(allowed.has(k), `${label}: unexpected key ${k}`);
  }
}

describe("tools-registry relational surface", () => {
  it("reject forbidden extra property under check (AJV)", () => {
    const v = loadSchemaValidator("tools-registry");
    const bad = JSON.parse(
      readFileSync(join(root, "test", "fixtures", "registry-relational-forbidden-key.json"), "utf8"),
    );
    assert.equal(v(bad), false);
  });

  it("allowlists match exemplar registry fixture objects", () => {
    const reg = JSON.parse(
      readFileSync(join(root, "test", "fixtures", "relational-verification", "registry.json"), "utf8"),
    );
    for (const entry of reg) {
      assertKeys(entry, TOOL_KEYS, "tool");
      assert.equal(entry.verification.kind, "sql_relational");
      assertKeys(entry.verification, SQL_REL_KEYS, "verification");
      for (const chk of entry.verification.checks) {
        if (chk.checkKind === "aggregate") {
          assertKeys(chk, AGG_KEYS, "aggregate");
          assertKeys(chk.expect, EXPECT_KEYS, "expect");
        } else if (chk.checkKind === "join_count") {
          assertKeys(chk, JOIN_KEYS, "join_count");
          assertKeys(chk.join, JOIN_INNER_KEYS, "join");
          assertKeys(chk.expect, EXPECT_KEYS, "expect");
        } else if (chk.checkKind === "related_exists") {
          assertKeys(chk, EXISTS_KEYS, "related_exists");
        } else {
          assert.fail(`unknown checkKind ${chk.checkKind}`);
        }
        if (chk.whereEq) {
          for (const w of chk.whereEq) {
            if ("tableSide" in w) assertKeys(w, WHERE_SIDE_KEYS, "whereEq side");
            else assertKeys(w, WHERE_PLAIN_KEYS, "whereEq plain");
          }
        }
      }
    }
  });
});
