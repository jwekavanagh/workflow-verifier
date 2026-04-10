const CONTACT_SALES_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates CONTACT_SALES_EMAIL (bare email). Used by next.config and pricing.
 */
export function assertContactSalesEmail(): string {
  const v = process.env.CONTACT_SALES_EMAIL?.trim() ?? "";
  if (!CONTACT_SALES_EMAIL_RE.test(v)) {
    throw new Error(
      "CONTACT_SALES_EMAIL must be set to a bare email address (e.g. sales@company.com). See website/.env.example.",
    );
  }
  return v;
}

export function enterpriseMailtoHref(): string {
  return `mailto:${assertContactSalesEmail()}`;
}
