#!/usr/bin/env node
/**
 * Fail if quickVerify sources contain obvious non-SELECT DML keywords (PR12 guard).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, "..", "src", "quickVerify");
const forbidden = /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE)\b/i;

let failed = false;
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".ts")) continue;
  const t = readFileSync(join(dir, f), "utf8");
  if (forbidden.test(t)) {
    console.error(`quick-verify-sql-allowlist: forbidden pattern in ${f}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("quick-verify-sql-allowlist ok");
