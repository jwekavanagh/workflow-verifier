import { productCopy } from "@/content/productCopy";
import discoveryAcquisition from "@/lib/discoveryAcquisition";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Examples — AgentSkeptic",
  description: productCopy.examplesIndexDescription,
  robots: { index: false, follow: true },
};

export default function ExamplesHubPage() {
  return (
    <main className="integrate-main">
      <h1>Examples</h1>
      <p className="lede">{productCopy.examplesHubLedes.primary}</p>
      <p className="lede muted">{productCopy.examplesHubLedes.secondaryMuted}</p>
      <ul className="mechanism-list">
        {discoveryAcquisition.indexableExamples.map((e) => (
          <li key={e.path}>
            <Link href={e.path}>{e.navLabel}</Link>
          </li>
        ))}
      </ul>
      <p className="lede">
        {productCopy.examplesHubIntegrateLede.before}
        <Link href="/integrate">/integrate</Link>
        {productCopy.examplesHubIntegrateLede.after}
      </p>
    </main>
  );
}
