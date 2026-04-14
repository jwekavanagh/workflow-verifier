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
    <main style={{ padding: "1.5rem", maxWidth: "48rem", margin: "0 auto" }}>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <OssClaimClient />
      </Suspense>
    </main>
  );
}
