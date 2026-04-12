import { VerificationReportView } from "@/components/VerificationReportView";
import { productCopy } from "@/content/productCopy";
import indexedGuideFixture from "@/content/indexedGuideFixture";
import type { PublicReportEnvelope } from "@/lib/publicVerificationReportService";
import Link from "next/link";
import type { ReactNode } from "react";

const embed = indexedGuideFixture as unknown as PublicReportEnvelope;
const humanText = embed.kind === "workflow" ? embed.truthReportText : embed.humanReportText;

type Props = {
  children: ReactNode;
};

/**
 * Shared layout for indexable /guides/* acquisition pages: prose, bundled verification embed, single integrate CTA.
 */
export function IndexedGuideShell({ children }: Props) {
  return (
    <main className="integrate-main" data-testid="indexed-guide-shell">
      {children}
      <section className="home-section" aria-labelledby="embed-heading">
        <h2 id="embed-heading">{productCopy.indexedGuideEmbedTitle}</h2>
        <p className="muted">{productCopy.indexedGuideEmbedMuted}</p>
        <VerificationReportView humanText={humanText} payload={embed} variant="embed" />
      </section>
      <p className="home-cta-row">
        <Link className="btn" href="/integrate">
          Run first-run integration
        </Link>
      </p>
    </main>
  );
}
