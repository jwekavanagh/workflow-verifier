/**
 * Defaults so `npx vitest run` works without a full .env when tests do not need real secrets.
 * Funnel persistence tests still require DATABASE_URL and throw in beforeAll if unset.
 */
if (!process.env.CONTACT_SALES_EMAIL?.trim()) {
  process.env.CONTACT_SALES_EMAIL = "sales-vitest@example.com";
}
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  process.env.AUTH_SECRET = "x".repeat(40);
}
