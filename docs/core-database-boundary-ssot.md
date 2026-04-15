# Core database boundary — single source of truth

Audience: **engineer**, **operator**.

## Purpose

Prevent **non-production-like** processes (local dev, CI, preview, staging) from opening the **production core** Postgres `DATABASE_URL`. Sanctioned migration tooling must not bypass the check.

**Production-like** means `VERCEL_ENV === "production"` (see [`website/src/lib/canonicalSiteOrigin.ts`](../website/src/lib/canonicalSiteOrigin.ts)).

## Forbidden fingerprint (single source of truth)

- **File:** [`config/commercial-production-core-database-fingerprint.sha256`](../config/commercial-production-core-database-fingerprint.sha256) — exactly **one** line: lowercase hex SHA-256 (64 chars).
- **Meaning:** SHA-256 of the **normalized** connection string for the real production core database URL (see normalization below).
- **Rotation:** When the production core DSN changes, update the file in a PR and redeploy; the hash must match `computeCoreDatabaseFingerprint(normalizeDatabaseUrlForFingerprint(actualProductionUrl))`.

**Placeholder fingerprint (repo default):** The committed file ships with a hash of a **non-resolvable placeholder** host (`__agentskeptic_production_core__`) so typical CI `localhost` URLs never match. **Operators must replace** this line with the real production fingerprint before relying on the boundary in production (or keep placeholder until production URL is finalized).

## Normalization (normative)

Must match [`website/src/lib/coreDatabaseBoundary.ts`](../website/src/lib/coreDatabaseBoundary.ts) and [`scripts/core-database-boundary-preflight.mjs`](../scripts/core-database-boundary-preflight.mjs):

1. Trim the raw URL string.
2. Replace `postgres://` or `postgresql://` with `http://` for parsing only.
3. Parse with `URL`; hostname **lowercased**; default port **5432** if absent.
4. Query string: sort parameter keys lexicographically; rebuild as `k=v` joined with `&` (omit `?` if empty).
5. Canonical string: `postgresql://{host}:{port}{pathname}{?sortedQuery}` (credentials are **not** included — only host, port, path, sorted query).

`computeCoreDatabaseFingerprint(url)` = SHA-256 hex (lowercase) of the UTF-8 bytes of that canonical string.

## Policy

- If **production-like** → boundary check **skipped** for `DATABASE_URL` (production uses real hosted URLs).
- If **not** production-like and `DATABASE_URL` is empty or equals the website build **placeholder** DSN (`postgresql://127.0.0.1:5432/workflow_verifier_build_placeholder`) → **skipped**.
- Otherwise → if fingerprint equals the forbidden line → **throw** / exit **1** with message `AGENTSKEPTIC_CORE_DATABASE_BOUNDARY_VIOLATION` (see code for exact string).

## Enforcement entrypoints (closed list)

| Location | Role |
|----------|------|
| [`website/src/db/client.ts`](../website/src/db/client.ts) | Calls `assertCoreDatabaseBoundary` before `postgres()`. |
| [`website/instrumentation.ts`](../website/instrumentation.ts) | Same assert on cold start (belt-and-suspenders). |
| [`website/scripts/db-migrate.mjs`](../website/scripts/db-migrate.mjs) | Runs [`scripts/core-database-boundary-preflight.mjs`](../scripts/core-database-boundary-preflight.mjs) after merging `website/.env`. |
| [`website/scripts/drizzle-kit-guarded.mjs`](../website/scripts/drizzle-kit-guarded.mjs) | Preflight then forwards to `drizzle-kit`. |
| [`scripts/validate-commercial-funnel.mjs`](../scripts/validate-commercial-funnel.mjs) | Preflight after `DATABASE_URL` required check. |
| [`scripts/website-holistic-gate.mjs`](../scripts/website-holistic-gate.mjs) | Preflight after env validation. |
| [`scripts/run-commercial-e2e.mjs`](../scripts/run-commercial-e2e.mjs) | Preflight; migrate via `website/scripts/db-migrate.mjs` (not raw `drizzle-kit`). |
| [`website/__tests__/helpers/siteTestServer.ts`](../website/__tests__/helpers/siteTestServer.ts) | Preflight before starting Next. |

## Sanctioned `drizzle-kit`

Only:

- `npm run db:migrate` → [`website/scripts/db-migrate.mjs`](../website/scripts/db-migrate.mjs)
- `npm run db:generate` → [`website/scripts/drizzle-kit-guarded.mjs`](../website/scripts/drizzle-kit-guarded.mjs) (website package)

Direct `npx drizzle-kit …` against team infrastructure is **unsupported** and not part of the compliance surface.

## CI workflow host audit

- **Static scan:** [`scripts/assert-ci-workflows-database-url-hosts.mjs`](../scripts/assert-ci-workflows-database-url-hosts.mjs) — fails if any workflow literal `DATABASE_URL:` or `TELEMETRY_DATABASE_URL:` (non–`${{ }}`) uses a host other than `localhost` / `127.0.0.1`.
- **Placement:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) → `jobs.test` and `jobs.commercial` → immediately after `actions/checkout@v5` (before `setup-node` on `test`).
- **Runtime guard (GitHub Actions only):** [`scripts/assert-ci-postgres-env-safety.mjs`](../scripts/assert-ci-postgres-env-safety.mjs) with `--require-core-and-telemetry` on `jobs.commercial` so the job must set both URLs and they must still resolve to localhost-only hosts (belt-and-suspenders vs secrets or env injection).
- **Split-behavior flags:** `jobs.test` sets `AGENTSKEPTIC_TELEMETRY_WRITES_TELEMETRY_DB=0` (root `test:ci` does not rely on website core/telemetry fixture split). `jobs.commercial` sets `AGENTSKEPTIC_TELEMETRY_WRITES_TELEMETRY_DB=1` against isolated DB names `wfv_website` / `wfv_telemetry` on the job Postgres service.

## Cross-links

- Commercial guards: [`docs/website-security-and-operations.md`](website-security-and-operations.md)
- Telemetry store + cutover: [`docs/telemetry-storage-ssot.md`](telemetry-storage-ssot.md)
