/**
 * Resend rejects unverified `from` domains. `example.com` is never valid as a sender.
 * `onboarding@resend.dev` is for development only: Resend allows just the account mailbox as recipient
 * until you verify a domain and send from that domain (`EMAIL_FROM`). Production must verify DNS.
 */
export const DEFAULT_MAGIC_LINK_FROM =
  "AgentSkeptic <onboarding@resend.dev>";

export function resolvedMagicLinkFrom(): string {
  const v = process.env.EMAIL_FROM?.trim();
  return v && v.length > 0 ? v : DEFAULT_MAGIC_LINK_FROM;
}
