#!/usr/bin/env node
/**
 * Fails if any workflow-assigned Postgres URL uses a host other than localhost / 127.0.0.1.
 * Scans DATABASE_URL and TELEMETRY_DATABASE_URL. Skips GitHub expression values (${{ ... }}).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(root, ".github", "workflows");

const allowedHosts = new Set(["localhost", "127.0.0.1"]);

/** Workflow env keys that must point at CI fixture Postgres only. */
const urlVarsToScan = ["DATABASE_URL", "TELEMETRY_DATABASE_URL"];

function parseDatabaseUrlHost(valueRaw) {
  let v = valueRaw.trim();
  if (v.startsWith("${{")) return { skip: true, reason: "expression" };
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (!/^postgres(ql)?:/i.test(v)) {
    return { skip: true, reason: "not_postgres" };
  }
  const forParse = v.replace(/^postgres(ql)?:\/\//i, "http://");
  try {
    const u = new URL(forParse);
    return { skip: false, host: u.hostname.toLowerCase() };
  } catch {
    return { skip: true, reason: "parse_error" };
  }
}

let failed = false;
const files = readdirSync(workflowsDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
for (const f of files) {
  const p = path.join(workflowsDir, f);
  const text = readFileSync(p, "utf8");
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const varName of urlVarsToScan) {
      const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = lines[i].match(new RegExp(`^\\s*${escaped}:\\s*(.+)\\s*$`));
      if (!m) continue;
      const raw = m[1];
      const parsed = parseDatabaseUrlHost(raw);
      if (parsed.skip) continue;
      if (!allowedHosts.has(parsed.host)) {
        console.error(
          `assert-ci-workflows-database-url-hosts: disallowed ${varName} host "${parsed.host}" in ${p}:${i + 1}`,
        );
        failed = true;
      }
    }
  }
}

if (failed) {
  process.exit(1);
}
process.exit(0);
