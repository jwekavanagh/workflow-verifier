#!/usr/bin/env node
/**
 * Runtime guard for GitHub Actions: any Postgres URL present in the job env must use
 * localhost / 127.0.0.1 only (catches misconfiguration not visible as static workflow literals).
 *
 * Optional `--require-core-and-telemetry`: fail if DATABASE_URL or TELEMETRY_DATABASE_URL is
 * missing — use on jobs that must exercise the split (e.g. commercial website integration).
 *
 * Local runs: no-op (exit 0) so developers can use remote URLs in .env.
 */
const allowedHosts = new Set(["localhost", "127.0.0.1"]);

const requireBoth = process.argv.includes("--require-core-and-telemetry");

if (process.env.GITHUB_ACTIONS !== "true") {
  process.exit(0);
}

/** @param {string} raw */
function hostOfPostgresUrl(raw) {
  const t = raw.trim();
  if (!t || !/^postgres(ql)?:/i.test(t)) return null;
  const forParse = t.replace(/^postgres(ql)?:\/\//i, "http://");
  try {
    return new URL(forParse).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * @param {string} name
 * @param {string | undefined} raw
 * @param {{ required?: boolean }} opts
 */
function check(name, raw, opts = {}) {
  const { required = false } = opts;
  const v = raw?.trim() ?? "";
  if (v.length === 0) {
    if (required) {
      console.error(`assert-ci-postgres-env-safety: ${name} is required in this job but empty`);
      process.exit(1);
    }
    return;
  }
  const host = hostOfPostgresUrl(v);
  if (host === null) {
    console.error(`assert-ci-postgres-env-safety: ${name} is not a valid postgres URL`);
    process.exit(1);
  }
  if (!allowedHosts.has(host)) {
    console.error(
      `assert-ci-postgres-env-safety: ${name} must use host localhost or 127.0.0.1 in CI (got "${host}")`,
    );
    process.exit(1);
  }
}

check("DATABASE_URL", process.env.DATABASE_URL, { required: requireBoth });
check("TELEMETRY_DATABASE_URL", process.env.TELEMETRY_DATABASE_URL, { required: requireBoth });
