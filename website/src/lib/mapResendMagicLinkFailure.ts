import { CredentialsSignin } from "@auth/core/errors";

/**
 * Resend returns plain validation messages for common misconfigurations.
 * Map them to {@link CredentialsSignin} so Auth.js exposes `error` + `code` to the client
 * (plain `Error` is surfaced as `Configuration`, which is not actionable in the UI).
 *
 * @see https://resend.com/docs/api-reference/errors
 */
export function throwIfResendMagicLinkMisconfigured(resendMessage: string): void {
  const m = resendMessage.toLowerCase();
  if (m.includes("only send testing emails to your own")) {
    const e = new CredentialsSignin();
    e.code = "resend_testing_recipients";
    throw e;
  }
  if (m.includes("domain is not verified")) {
    const e = new CredentialsSignin();
    e.code = "resend_from_domain_unverified";
    throw e;
  }
}
