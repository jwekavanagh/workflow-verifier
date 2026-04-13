import { describe, expect, it } from "vitest";
import { CredentialsSignin } from "@auth/core/errors";
import { throwIfResendMagicLinkMisconfigured } from "@/lib/mapResendMagicLinkFailure";

describe("throwIfResendMagicLinkMisconfigured", () => {
  it("maps Resend testing-recipient 403 copy to CredentialsSignin", () => {
    let err: unknown;
    try {
      throwIfResendMagicLinkMisconfigured(
        "You can only send testing emails to your own email address (you@domain.com). To send emails to other recipients, please verify a domain at resend.com/domains, and change the `from` address to an email using this domain.",
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CredentialsSignin);
    expect((err as CredentialsSignin).code).toBe("resend_testing_recipients");
  });

  it("maps unverified from-domain copy to CredentialsSignin", () => {
    let err: unknown;
    try {
      throwIfResendMagicLinkMisconfigured(
        "The `example.com` domain is not verified. Please, add and verify your domain.",
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CredentialsSignin);
    expect((err as CredentialsSignin).code).toBe("resend_from_domain_unverified");
  });

  it("does not intercept unrelated messages", () => {
    expect(() => throwIfResendMagicLinkMisconfigured("Something else failed")).not.toThrow();
  });
});
