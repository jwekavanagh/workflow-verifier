import { productCopy } from "@/content/productCopy";
import discoveryAcquisition from "@/lib/discoveryAcquisition";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guides — AgentSkeptic",
  description: "Index of problem-oriented guides for read-only SQL verification after agent and automation workflows.",
  robots: { index: false, follow: true },
};

export default function GuidesHubPage() {
  return (
    <main className="integrate-main">
      <h1>Guides</h1>
      <p className="lede">Problem-oriented guides for trace-shaped success versus database truth.</p>
      <p className="lede">{productCopy.guidesHubSupportingSentence}</p>
      <ul className="mechanism-list">
        {discoveryAcquisition.indexableGuides.map((g) => (
          <li key={g.path}>
            <Link href={g.path}>{g.navLabel}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
