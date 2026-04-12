import { ExampleVerificationEmbed } from "@/components/examples/ExampleVerificationEmbed";
import { getIndexableExample, indexableExampleCanonical } from "@/lib/indexableGuides";
import type { Metadata } from "next";
import Link from "next/link";

const path = "/examples/wf-complete";

export const metadata: Metadata = {
  title: "Example verified workflow wf_complete — AgentSkeptic",
  description:
    "Static public example: bundled wf_complete workflow result and human truth report with read-only SQL aligned to structured tool activity at verification time.",
  robots: { index: true, follow: true },
  alternates: { canonical: indexableExampleCanonical(path) },
};

export default function ExampleWfCompletePage() {
  const e = getIndexableExample(path);
  return (
    <main className="integrate-main">
      <h1>{e.navLabel}</h1>
      <p className="lede">{e.problemAnchor}</p>
      <p className="lede">
        This page is for <strong>organic discovery</strong>: it shows the same bundled success path you get from{" "}
        <code>npm start</code>, rendered as a public verification envelope. For wiring read-only SQL on your own
        database, use <Link href="/integrate">/integrate</Link>.
      </p>
      <ExampleVerificationEmbed variant="wf_complete" />
      <p className="home-cta-row">
        <Link className="btn" href="/integrate">
          Run first-run integration
        </Link>
      </p>
    </main>
  );
}
