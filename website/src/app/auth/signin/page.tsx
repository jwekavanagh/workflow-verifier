"use client";

import { LiveStatus } from "@/components/LiveStatus";
import { productCopy } from "@/content/productCopy";
import { emailSignInOptions } from "@/lib/sanitizeInternalCallbackUrl";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function SignInForm() {
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get("callbackUrl");

  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ mode: "polite" | "assertive"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setNotice(null);
    setIsSubmitting(true);
    try {
      const r = await signIn("email", emailSignInOptions(email, rawCallback));
      if (r?.error) {
        let text = productCopy.signInA11y.sendEmailError;
        if (r.error === "CredentialsSignin") {
          if (r.code === "resend_testing_recipients") {
            text = productCopy.signInA11y.sendEmailResendTestingRecipients;
          } else if (r.code === "resend_from_domain_unverified") {
            text = productCopy.signInA11y.sendEmailResendFromDomainUnverified;
          } else if (r.code === "magic_link_rate_limited") {
            text = productCopy.signInA11y.sendEmailRateLimited;
          }
        }
        setNotice({ mode: "assertive", text });
      } else {
        setNotice({ mode: "polite", text: productCopy.signInA11y.magicLinkSent });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <h1>{productCopy.signInPurpose.title}</h1>
      <p className="muted">{productCopy.signInPurpose.intro}</p>
      <ul className="signin-benefits">
        {productCopy.signInPurpose.benefits.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="card card-narrow-24 u-mt-1">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="signin-email-field"
        />
        <button type="submit" disabled={isSubmitting} className="u-mt-1">
          Send magic link
        </button>
      </form>
      {notice && (
        <LiveStatus mode={notice.mode}>
          <p className="u-mt-1">{notice.text}</p>
        </LiveStatus>
      )}
    </>
  );
}

export default function SignInPage() {
  return (
    <main>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <SignInForm />
      </Suspense>
    </main>
  );
}
