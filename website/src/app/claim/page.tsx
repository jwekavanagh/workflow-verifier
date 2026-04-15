import { OssClaimClient } from "@/components/OssClaimClient";
import { siteMetadata } from "@/content/siteMetadata";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: siteMetadata.claim.title,
  description: siteMetadata.claim.description,
};

export default function ClaimPage() {
  return (
    <main className="claim-page-main">
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <OssClaimClient />
      </Suspense>
    </main>
  );
}
