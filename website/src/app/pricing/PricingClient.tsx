"use client";

import { productCopy } from "@/content/productCopy";
import type { PlanId } from "@/lib/plans";
import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";

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
      {err && <p className="error-text">{err}</p>}
      <div className="pricing-grid" style={{ marginTop: "1.5rem" }}>
        {plans.map((p) => (
          <div
            key={p.id}
            className={`card${p.recommended ? " pricing-card-recommended" : ""}`}
            data-plan={p.id}
            data-recommended={p.recommended ? "true" : "false"}
            aria-label={p.recommended ? `${p.headline} — recommended for most teams` : undefined}
          >
            {p.recommended && (
              <p className="pricing-recommended-pill" data-testid="pricing-recommended-pill">
                Recommended for most teams
              </p>
            )}
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
            {p.checkoutPlanId !== null &&
              (authed ? (
                <button
                  type="button"
                  disabled={loading !== null}
                  onClick={() => checkout(p.checkoutPlanId!)}
                  style={{ marginTop: "0.75rem" }}
                >
                  {loading === p.checkoutPlanId ? "…" : "Subscribe"}
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
