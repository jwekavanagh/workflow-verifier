/** Wall-clock TTL for OSS claim tickets (72 hours). */
export const OSS_CLAIM_TICKET_TTL_MS = 72 * 60 * 60 * 1000;

export function expiresAtFromCreated(created: Date): Date {
  return new Date(created.getTime() + OSS_CLAIM_TICKET_TTL_MS);
}
