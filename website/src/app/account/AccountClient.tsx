"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { CommercialAccountStatePayload } from "@/lib/commercialAccountState";
import type { PriceMapping } from "@/lib/accountEntitlementSummary";
import {
  STRIPE_CUSTOMER_MISSING_ERROR,
  STRIPE_CUSTOMER_MISSING_MESSAGE,
} from "@/lib/billingPortalConstants";
import { SignOutButton } from "../SignOutButton";

function billingSyncDisplay(mapping: PriceMapping): { label: string; title: string } {
  if (mapping === "mapped") {
    return {
      label: "Billing sync: OK",
      title: "Your subscription is linked to your plan for quota and licensed features.",
    };
  }
  return {
    label: "Billing sync: needs attention",
    title: "We have not finished linking your subscription to your plan yet.",
  };
}

export function AccountClient({
  hasKey,
  initialCommercial,
}: {
  hasKey: boolean;
  initialCommercial: CommercialAccountStatePayload;
}) {
  const searchParams = useSearchParams();
  const checkout = searchParams.get("checkout");
  const expectedPlanRaw = searchParams.get("expectedPlan");

  const [key, setKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [commercial, setCommercial] = useState<CommercialAccountStatePayload>(initialCommercial);
  const [activationUi, setActivationUi] = useState<"idle" | "pending" | "ready" | "timeout">("idle");
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalErr, setPortalErr] = useState<string | null>(null);

  const billing = billingSyncDisplay(commercial.priceMapping);

  useEffect(() => {
    setCommercial(initialCommercial);
  }, [initialCommercial]);

  useEffect(() => {
    if (checkout !== "success" || !expectedPlanRaw) {
      setActivationUi("idle");
      return;
    }
    let cancelled = false;
    setActivationUi("pending");

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    void (async () => {
      for (let i = 0; i < 30; i++) {
        if (cancelled) return;
        const r = await fetch(
          `/api/account/commercial-state?expectedPlan=${encodeURIComponent(expectedPlanRaw)}`,
        );
        if (cancelled) return;
        if (!r.ok) {
          await sleep(1000);
          continue;
        }
        const j = (await r.json()) as CommercialAccountStatePayload;
        setCommercial(j);
        if (j.checkoutActivationReady) {
          if (!cancelled) setActivationUi("ready");
          return;
        }
        if (i === 29) {
          if (!cancelled) setActivationUi("timeout");
          return;
        }
        await sleep(1000);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [checkout, expectedPlanRaw]);

  async function openBillingPortal() {
    setPortalErr(null);
    setPortalLoading(true);
    try {
      const r = await fetch("/api/account/billing-portal", { method: "POST" });
      const j = (await r.json()) as { url?: string; error?: string; message?: string };
      if (r.status === 404 && j.error === STRIPE_CUSTOMER_MISSING_ERROR) {
        setPortalErr(j.message ?? STRIPE_CUSTOMER_MISSING_MESSAGE);
        return;
      }
      if (!r.ok) {
        setPortalErr(j.error === "Internal Server Error" ? "Billing portal is unavailable. Try again later." : (j.error ?? "Billing portal failed"));
        return;
      }
      if (j.url) window.location.href = j.url;
    } finally {
      setPortalLoading(false);
    }
  }

  async function createKey() {
    setErr(null);
    const r = await fetch("/api/account/create-key", { method: "POST" });
    const j = (await r.json()) as { apiKey?: string; error?: string };
    if (!r.ok) {
      setErr(j.error ?? "Failed");
      return;
    }
    if (j.apiKey) setKey(j.apiKey);
  }

  const showInactiveBillingCta = commercial.subscriptionStatus === "inactive";

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <p style={{ marginTop: 0, marginBottom: "1rem" }}>
        <SignOutButton variant="account" />
      </p>
      <h2>Subscription and entitlements</h2>
      <p>
        <strong>Plan:</strong> {commercial.plan}
      </p>
      <p>
        <strong>Subscription status:</strong> {commercial.subscriptionStatus}
      </p>
      <p title={billing.title}>
        <strong>Billing:</strong> {billing.label}
      </p>
      {commercial.hasStripeCustomer && (
        <p style={{ marginTop: "0.5rem" }}>
          <button
            type="button"
            data-testid="manage-billing-button"
            disabled={portalLoading}
            onClick={() => void openBillingPortal()}
          >
            {portalLoading ? "…" : "Manage billing"}
          </button>
        </p>
      )}
      {portalErr && (
        <p className="error-text" data-testid="billing-portal-error" style={{ marginTop: "0.35rem" }}>
          {portalErr}
        </p>
      )}
      {commercial.billingPriceSyncHint && (
        <div
          className="muted"
          style={{
            marginTop: "0.75rem",
            padding: "0.75rem 1rem",
            border: "1px solid var(--muted)",
            borderRadius: "6px",
          }}
          data-testid="billing-price-sync-hint"
        >
          <p style={{ margin: 0 }}>
            <strong>Billing setup is still finishing.</strong> Your payment looks active, but we have not fully
            connected it to your plan yet. If this message stays after refreshing in a few minutes,{" "}
            {commercial.billingPriceSyncHint.supportEmail ? (
              <>
                email{" "}
                <a href={`mailto:${commercial.billingPriceSyncHint.supportEmail}`}>
                  {commercial.billingPriceSyncHint.supportEmail}
                </a>{" "}
                and include the address you use to sign in.
              </>
            ) : (
              <>use the contact options in the site footer.</>
            )}
          </p>
        </div>
      )}
      {showInactiveBillingCta && (
        <div
          className="muted"
          style={{
            marginTop: "0.75rem",
            padding: "0.75rem 1rem",
            border: "1px solid var(--muted)",
            borderRadius: "6px",
          }}
          data-testid="inactive-subscription-notice"
        >
          <p style={{ margin: 0 }}>
            Your subscription is not active, so licensed verification and enforcement are paused.
            {commercial.hasStripeCustomer
              ? " Use Manage billing above to update payment or your subscription, or choose a plan again from Pricing."
              : " Subscribe from Pricing to restore access."}
          </p>
          <p style={{ margin: "0.5rem 0 0" }}>
            <Link href="/pricing">View pricing and subscribe</Link>
          </p>
        </div>
      )}
      {checkout === "success" && expectedPlanRaw && (
        <div style={{ marginTop: "0.75rem" }}>
          {activationUi === "pending" && (
            <p className="muted" data-testid="checkout-activation-pending">
              Finishing subscription setup… This usually takes a few seconds. You can refresh the page
              if it does not update.
            </p>
          )}
          {activationUi === "ready" && (
            <p style={{ color: "var(--muted)" }} data-testid="checkout-activation-ready">
              Your subscription is active. You can use licensed verify with your API key.
            </p>
          )}
          {activationUi === "timeout" && (
            <p style={{ color: "#f4212e" }} data-testid="checkout-activation-timeout">
              Still processing—refresh in a minute or contact the operator if this persists.
            </p>
          )}
        </div>
      )}
      <p style={{ marginTop: "0.75rem" }}>{commercial.entitlementSummary}</p>

      <h2 style={{ marginTop: "1.5rem" }}>API key</h2>
      {!hasKey && !key && (
        <button type="button" onClick={createKey}>
          Generate API key
        </button>
      )}
      {err && <p style={{ color: "#f4212e" }}>{err}</p>}
      {key && (
        <p data-testid="api-key-plaintext" style={{ wordBreak: "break-all", marginTop: "0.75rem" }}>
          {key}
        </p>
      )}

      <h2 style={{ marginTop: "1.5rem" }}>Next steps</h2>
      <p style={{ marginTop: "0.35rem" }}>
        <Link href="/integrate">Run your first verification</Link> — step-by-step commands you can paste
        for your database.
      </p>
      <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.95rem" }}>
        Commercial CLI: set <code>AGENTSKEPTIC_API_KEY</code> (legacy <code>WORKFLOW_VERIFIER_API_KEY</code> still
        works), then run{" "}
        <code style={{ wordBreak: "break-all" }}>npx agentskeptic verify …</code> from your repo (see
        Integrate for the full command).
      </p>
    </div>
  );
}
