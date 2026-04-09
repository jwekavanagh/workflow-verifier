/**
 * Auth.js requires a secret (≥32 chars). Local dev often runs without `.env.local`;
 * production and `next build` must set AUTH_SECRET (or NEXTAUTH_SECRET).
 */
const DEV_FALLBACK =
  "workflow-verifier-dev-only-never-use-in-production-32chars";

let devWarned = false;

export function resolveAuthSecret(): string {
  const raw =
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (raw) {
    if (raw.length < 32) {
      throw new Error(
        "AUTH_SECRET must be at least 32 characters (e.g. openssl rand -base64 32).",
      );
    }
    return raw;
  }

  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "development" || nodeEnv === "test") {
    if (nodeEnv === "development" && !devWarned) {
      devWarned = true;
      console.warn(
        "[auth] AUTH_SECRET is unset; using a dev-only fallback. Copy website/.env.example to .env.local and set AUTH_SECRET for production parity.",
      );
    }
    return DEV_FALLBACK;
  }

  throw new Error(
    "AUTH_SECRET is required. Copy website/.env.example to .env.local and set AUTH_SECRET (or set it in CI for next build).",
  );
}
