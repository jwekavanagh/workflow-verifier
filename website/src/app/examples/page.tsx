import discoveryAcquisition from "@/lib/discoveryAcquisition";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Examples — AgentSkeptic",
  description:
    "Index of indexable public verification examples (bundled wf_complete and wf_missing) backed by committed JSON envelopes.",
  robots: { index: false, follow: true },
};

export default function ExamplesHubPage() {
  return (
    <main className="integrate-main">
      <h1>Examples</h1>
      <p className="lede">
        Static, indexable pages that render committed public-report envelopes—separate from private{" "}
        <code>/r/</code> share links (those stay <strong>noindex</strong>).
      </p>
      <ul className="mechanism-list">
        {discoveryAcquisition.indexableExamples.map((e) => (
          <li key={e.path}>
            <Link href={e.path}>{e.navLabel}</Link>
          </li>
        ))}
      </ul>
      <p className="lede">
        For first-run on your database, follow <Link href="/integrate">/integrate</Link> and read-only SQL verification
        contracts in the repository docs.
      </p>
    </main>
  );
}
