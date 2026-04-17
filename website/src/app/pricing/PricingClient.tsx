"use client";

import { LiveStatus } from "@/components/LiveStatus";
import { productCopy } from "@/content/productCopy";
import type { PlanId } from "@/lib/plans";
import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";

const PRICING_SIGNIN_HREF = "/auth/signin?callbackUrl=%2Fpricing";

export type PlanRow = {
  id: PlanId;
  checkoutPlanId: PlanId | null;
  headline: string;
  displayPrice: string;
  includedMonthly: number | null;
  audience: string;
  valueUnlock: string;
  recommended: boolean;
};

function paidCheckoutCtaLabel(plan: PlanId): string {
  const ctas = productCopy.pricingPlanCtas;
  if (plan === "individual") return ctas.individual.checkoutLabel;
  if (plan === "team") return ctas.team.checkoutLabel;
  if (plan === "business") return ctas.business.checkoutLabel;
  return "Continue to checkout";
}

function paidSignInCtaLabel(plan: PlanId): string {
  const ctas = productCopy.pricingPlanCtas;
  if (plan === "individual") return ctas.individual.signInLabel;
  if (plan === "team") return ctas.team.signInLabel;
  if (plan === "business") return ctas.business.signInLabel;
  return "Get started";
}

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

  async function checkout(plan: PlanId) {
    setErr(null);
    setLoading(plan);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ plan }),
      });
      const text = await r.text();
      let j: { url?: string; error?: string };
      try {
        j = JSON.parse(text) as { url?: string; error?: string };
      } catch {
        setErr(
          r.ok
            ? "Unexpected response from checkout. Please refresh and try again."
            : `Checkout failed (${r.status}). If this persists, contact support.`,
        );
        return;
      }
      if (!r.ok) {
        setErr(j.error ?? "Checkout failed");
        return;
      }
      if (typeof j.url === "string" && j.url.length > 0) {
        window.location.assign(j.url);
        return;
      }
      setErr(j.error ?? "Checkout did not return a payment link. Check Stripe configuration.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error starting checkout.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {err && (
        <LiveStatus mode="assertive">
          <p className="error-text">{err}</p>
        </LiveStatus>
      )}
      <div className="pricing-grid pricing-grid-after-hero">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`card pricing-card-${p.id}${p.recommended ? " pricing-card-recommended" : ""}`}
            data-plan={p.id}
            data-recommended={p.recommended ? "true" : "false"}
            aria-label={
              p.recommended
                ? `${p.headline} — ${productCopy.pricingRecommendedPill}`
                : undefined
            }
          >
            {p.recommended && (
              <p className="pricing-recommended-pill" data-testid="pricing-recommended-pill">
                {productCopy.pricingRecommendedPill}
              </p>
            )}
            <h2>{p.headline}</h2>
            <p className="pricing-card-price">{p.displayPrice}</p>
            <p
              className="pricing-card-quota muted"
              data-included-monthly={p.includedMonthly ?? "custom"}
            >
              {p.id === "enterprise"
                ? "Custom pricing and limits"
                : p.includedMonthly === null
                  ? "Custom"
                  : p.includedMonthly === 0
                    ? productCopy.pricingCardStarterPaidQuotaCaption
                    : `${p.includedMonthly.toLocaleString()} verifications / month`}
            </p>
            <p className="pricing-card-outcome muted">
              <strong>Best for:</strong> {p.audience}
            </p>
            <p className="pricing-card-includes muted">
              <strong>What you get:</strong> {p.valueUnlock}
            </p>
            {p.id === "starter" && (
              <Link
                className="btn-pricing-secondary pricing-card-cta"
                href={productCopy.pricingPlanCtas.starter.href}
              >
                {productCopy.pricingPlanCtas.starter.label}
              </Link>
            )}
            {p.checkoutPlanId !== null &&
              (authed ? (
                <button
                  type="button"
                  className={`pricing-card-cta${p.recommended ? " pricing-cta-emphasized" : ""}`}
                  disabled={loading !== null}
                  onClick={() => checkout(p.checkoutPlanId!)}
                >
                  {loading === p.checkoutPlanId ? "…" : paidCheckoutCtaLabel(p.checkoutPlanId)}
                </button>
              ) : (
                <Link
                  className={`pricing-card-cta${p.recommended ? " pricing-cta-emphasized" : " btn-pricing-secondary"}`}
                  href={PRICING_SIGNIN_HREF}
                >
                  {paidSignInCtaLabel(p.checkoutPlanId)}
                </Link>
              ))}
            {p.id === "enterprise" && (
              <a className="btn pricing-card-cta" href={enterpriseMailto}>
                {productCopy.pricingPlanCtas.enterprise.label}
              </a>
            )}
            {p.id === "team" && (
              <p className="pricing-team-footnote muted" data-testid="pricing-team-footnote">
                {productCopy.pricingTeamFootnote}
              </p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
