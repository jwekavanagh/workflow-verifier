import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialsSignin } from "@auth/core/errors";

const sendMock = vi.fn().mockResolvedValue({ data: {}, error: null });

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

describe("sendMagicLink", () => {
  const origE2E = process.env.E2E_COMMERCIAL_FUNNEL;
  const origResend = process.env.RESEND_API_KEY;

  beforeEach(() => {
    sendMock.mockClear();
    delete process.env.E2E_COMMERCIAL_FUNNEL;
    process.env.RESEND_API_KEY = "re_test";
  });

  afterEach(() => {
    if (origE2E === undefined) delete process.env.E2E_COMMERCIAL_FUNNEL;
    else process.env.E2E_COMMERCIAL_FUNNEL = origE2E;
    if (origResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = origResend;
  });

  it("calls Resend with magic link URL containing callback path", async () => {
    const { sendMagicLink } = await import("@/lib/sendMagicLink");
    const url = "http://127.0.0.1:3000/api/auth/callback/email?token=abc";
    await sendMagicLink("u@example.com", url);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0]![0] as { html: string };
    expect(arg.html).toContain("/api/auth/callback/");
  });

  it("throws CredentialsSignin when Resend rejects non-testing recipients", async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: {
        message:
          "You can only send testing emails to your own email address (you@domain.com). To send emails to other recipients, please verify a domain at resend.com/domains, and change the `from` address to an email using this domain.",
      },
    });
    const { sendMagicLink } = await import("@/lib/sendMagicLink");
    const url = "http://127.0.0.1:3000/api/auth/callback/email?token=abc";
    const caught = await sendMagicLink("new-user@example.com", url).then(
      () => null,
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(CredentialsSignin);
    expect((caught as CredentialsSignin).code).toBe("resend_testing_recipients");
  });
});
