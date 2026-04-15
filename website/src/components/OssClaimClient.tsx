"use client";

import { productCopy } from "@/content/productCopy";
import { OSS_CLAIM_STORAGE_KEY } from "@/lib/ossClaimSessionStorageKey";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

type RedeemOk = {
  schema_version: 1;
  run_id: string;
  terminal_status: string;
  workload_class: string;
  subcommand: string;
  build_profile: string;
  claimed_at: string;
};

type Phase =
  | "init"
  | "ready"
  | "redeeming"
  | "redeemed"
  | "error"
  | "same_browser";

export function OssClaimClient() {
  const { status } = useSession();
  const [phase, setPhase] = useState<Phase>("init");
  const [summary, setSummary] = useState<RedeemOk | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const redeemStarted = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash.length > 1) {
      const raw = hash.slice(1);
      let secret: string;
      try {
        secret = decodeURIComponent(raw);
      } catch {
        secret = raw;
      }
      if (/^[0-9a-f]{64}$/i.test(secret)) {
        sessionStorage.setItem(OSS_CLAIM_STORAGE_KEY, secret.toLowerCase());
      }
    }
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setPhase("ready");
  }, []);

  useEffect(() => {
    if (phase !== "ready" || status !== "authenticated" || redeemStarted.current) return;
    redeemStarted.current = true;
    setPhase("redeeming");

    void (async () => {
      const secret = sessionStorage.getItem(OSS_CLAIM_STORAGE_KEY);
      if (!secret) {
        setPhase("same_browser");
        return;
      }
      try {
        const res = await fetch("/api/oss/claim-redeem", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ claim_secret: secret }),
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.status === 200) {
          sessionStorage.removeItem(OSS_CLAIM_STORAGE_KEY);
          setSummary(data as RedeemOk);
          setPhase("redeemed");
          return;
        }
        if (res.status === 429 && data.code === "rate_limited") {
          setErrorMessage(productCopy.ossClaimPage.rateLimitedRedeem);
          setPhase("error");
          return;
        }
        if (res.status === 409) {
          setErrorMessage(productCopy.ossClaimPage.alreadyClaimed);
          setPhase("error");
          sessionStorage.removeItem(OSS_CLAIM_STORAGE_KEY);
          return;
        }
        setErrorMessage(productCopy.ossClaimPage.claimFailed);
        setPhase("error");
      } catch {
        setErrorMessage(productCopy.ossClaimPage.claimFailed);
        setPhase("error");
      }
    })();
  }, [phase, status]);

  if (phase === "init") {
    return <p className="muted">{productCopy.ossClaimPage.redeeming}</p>;
  }

  if (status === "loading") {
    return <p className="muted">{productCopy.ossClaimPage.redeeming}</p>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="card card-narrow-32">
        <h1>{productCopy.ossClaimPage.title}</h1>
        <p className="muted">{productCopy.ossClaimPage.introUnauthenticated}</p>
        <Link className="button-link" href="/auth/signin?callbackUrl=%2Fclaim">
          {productCopy.ossClaimPage.signInCta}
        </Link>
      </div>
    );
  }

  if (phase === "redeeming" || (phase === "ready" && status === "authenticated")) {
    return <p className="muted">{productCopy.ossClaimPage.redeeming}</p>;
  }

  if (phase === "same_browser") {
    return (
      <div className="card card-narrow-32">
        <h1>{productCopy.ossClaimPage.title}</h1>
        <p>{productCopy.ossClaimPage.sameBrowserRecovery}</p>
      </div>
    );
  }

  if (phase === "redeemed" && summary) {
    return (
      <div className="card card-narrow-32">
        <h1>{productCopy.ossClaimPage.title}</h1>
        <p>{productCopy.ossClaimPage.redeemedLead}</p>
        <p className="muted">{productCopy.ossClaimPage.runSummary(summary)}</p>
        <Link className="button-link" href="/account">
          {productCopy.ossClaimPage.accountCta}
        </Link>
      </div>
    );
  }

  if (phase === "error" && errorMessage) {
    return (
      <div className="card card-narrow-32">
        <h1>{productCopy.ossClaimPage.title}</h1>
        <p>{errorMessage}</p>
        <Link className="button-link" href="/account">
          {productCopy.ossClaimPage.accountCta}
        </Link>
      </div>
    );
  }

  return (
    <div className="card card-narrow-32">
      <h1>{productCopy.ossClaimPage.title}</h1>
      <p className="muted">{productCopy.ossClaimPage.introUnauthenticated}</p>
    </div>
  );
}
