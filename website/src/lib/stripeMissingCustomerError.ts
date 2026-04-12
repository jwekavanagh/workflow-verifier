/**
 * True when Stripe rejected a `customer` id (wrong mode, deleted customer, or stale DB).
 * Used to recover by clearing `user.stripe_customer_id` and retrying with `customer_email`.
 */
export function isStripeMissingCustomerError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const rec = e as { code?: unknown; message?: unknown };
  if (rec.code === "resource_missing") return true;
  if (typeof rec.message === "string" && /no such customer/i.test(rec.message)) return true;
  return false;
}
