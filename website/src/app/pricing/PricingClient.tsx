"use client";

import { productCopy } from "@/content/productCopy";
import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";

export type PlanRow = {
  id: "starter" | "team" | "business" | "enterprise";
  headline: string;
  displayPrice: string;
  includedMonthly: number | null;
  audience: string;
  valueUnlock: string;
};

export function PricingClient({
  plans,
  enterpriseMailto,
}: {
  plans: PlanRow[];
  enterpriseMailto: string;
}) {
  const { status } = useSession();
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const authed = status === "authenticated";

  async function checkout(plan: "team" | "business") {
    setErr(null);
    setLoading(plan);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok) {
        setErr(j.error ?? "Checkout failed");
        return;
      }
      if (j.url) window.location.href = j.url;
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {err && <p className="error-text">{err}</p>}
      <section
        className="muted"
        style={{ marginTop: "1rem", maxWidth: "42rem" }}
        aria-label="Commercial terms"
      >
        <p>Verification uses your monthly API quota and is not blocked by subscription status.</p>
        <p>
          CI and deployment enforcement (the enforce command) requires Team or Business with an active paid subscription.
        </p>
      </section>
      <div className="pricing-grid" style={{ marginTop: "1.5rem" }}>
        {plans.map((p) => (
          <div key={p.id} className="card" data-plan={p.id}>
            <h2>{p.headline}</h2>
            <p style={{ fontSize: "1.5rem" }}>{p.displayPrice}</p>
            <p
              data-included-monthly={p.includedMonthly ?? "custom"}
              style={{ color: "var(--muted)" }}
            >
              {p.includedMonthly === null
                ? "Custom"
                : `${p.includedMonthly.toLocaleString()} verifications / month`}
            </p>
            <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.95rem" }}>
              <strong>Who it&apos;s for:</strong> {p.audience}
            </p>
            <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.95rem" }}>
              <strong>Unlocks:</strong> {p.valueUnlock}
            </p>
            {p.id === "team" &&
              (authed ? (
                <button
                  type="button"
                  disabled={loading !== null}
                  onClick={() => checkout("team")}
                  style={{ marginTop: "0.75rem" }}
                >
                  {loading === "team" ? "…" : "Subscribe"}
                </button>
              ) : (
                <Link
                  className="btn-pricing-secondary"
                  href="/auth/signin?callbackUrl=%2Fpricing"
                  style={{ marginTop: "0.75rem" }}
                >
                  {productCopy.pricingSignInCta}
                </Link>
              ))}
            {p.id === "business" &&
              (authed ? (
                <button
                  type="button"
                  disabled={loading !== null}
                  onClick={() => checkout("business")}
                  style={{ marginTop: "0.75rem" }}
                >
                  {loading === "business" ? "…" : "Subscribe"}
                </button>
              ) : (
                <Link
                  className="btn-pricing-secondary"
                  href="/auth/signin?callbackUrl=%2Fpricing"
                  style={{ marginTop: "0.75rem" }}
                >
                  {productCopy.pricingSignInCta}
                </Link>
              ))}
            {p.id === "enterprise" && (
              <a
                className="btn"
                href={enterpriseMailto}
                style={{ display: "inline-block", marginTop: "0.75rem" }}
              >
                Contact sales
              </a>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
