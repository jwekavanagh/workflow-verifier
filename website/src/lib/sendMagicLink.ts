import nodemailer from "nodemailer";
import { Resend } from "resend";
import { resolvedMagicLinkFrom } from "./emailFrom";
import { throwIfResendMagicLinkMisconfigured } from "./mapResendMagicLinkFailure";

export async function sendMagicLink(identifier: string, url: string): Promise<void> {
  if (process.env.E2E_COMMERCIAL_FUNNEL === "1") {
    const transport = nodemailer.createTransport({
      host: "127.0.0.1",
      port: 1025,
      secure: false,
    });
    await transport.sendMail({
      to: identifier,
      from: resolvedMagicLinkFrom(),
      subject: "Sign in to AgentSkeptic",
      text: `Sign in: ${url}`,
      html: `<p><a href="${url}">Sign in</a></p>`,
    });
    return;
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is required when E2E_COMMERCIAL_FUNNEL is not set");
  }
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: resolvedMagicLinkFrom(),
    to: identifier,
    subject: "Sign in to AgentSkeptic",
    text: `Sign in: ${url}`,
    html: `<p><a href="${url}">Sign in</a></p>`,
  });
  if (error) {
    const message =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
        ? (error as { message: string }).message
        : JSON.stringify(error);
    console.error("[sendMagicLink] Resend error:", error);
    throwIfResendMagicLinkMisconfigured(message);
    throw new Error(message);
  }
}
