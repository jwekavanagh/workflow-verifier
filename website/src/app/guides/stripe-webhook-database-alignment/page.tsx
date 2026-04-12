import { IndexedGuideShell } from "@/components/guides/IndexedGuideShell";
import { getIndexableGuide, indexableGuideCanonical } from "@/lib/indexableGuides";
import type { Metadata } from "next";

const path = "/guides/stripe-webhook-database-alignment";

export const metadata: Metadata = {
  title: "Stripe webhooks vs database rows — AgentSkeptic",
  description:
    "Stripe webhooks return 200 while ledger tables disagree; compare structured tool or handler parameters to read-only SQL results at verification time before treating money movement as settled.",
  robots: { index: true, follow: true },
  alternates: { canonical: indexableGuideCanonical(path) },
};

export default function StripeWebhookDbGuidePage() {
  const g = getIndexableGuide(path);
  return (
    <IndexedGuideShell>
      <h1>Stripe webhook OK vs database alignment</h1>
      <p className="lede">{g.problemAnchor}</p>
      <p className="lede">
        HTTP 200 on a webhook is not ledger truth: run read-only SQL that checks the row your handler claims to have
        written, using the same structured parameters you captured at verification time.
      </p>
      <p className="lede">
        Wire the handler&apos;s structured payload into NDJSON observations, then follow <code>/integrate</code> to
        align registry rules with your finance tables before you ship.
      </p>
      <ol className="mechanism-list">
        <li>Record structured parameters from the webhook path (invoice id, customer id, amounts).</li>
        <li>
          Map them to read-only row checks so AgentSkeptic can flag drift before downstream money movement workflows
          proceed.
        </li>
      </ol>
    </IndexedGuideShell>
  );
}
