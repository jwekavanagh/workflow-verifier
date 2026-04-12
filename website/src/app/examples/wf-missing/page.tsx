import { ExampleVerificationEmbed } from "@/components/examples/ExampleVerificationEmbed";
import { getIndexableExample, indexableExampleCanonical } from "@/lib/indexableGuides";
import type { Metadata } from "next";
import Link from "next/link";

const path = "/examples/wf-missing";

export const metadata: Metadata = {
  title: "Example inconsistent workflow wf_missing — AgentSkeptic",
  description:
    "Static public example: bundled wf_missing workflow shows ROW_ABSENT when read-only SQL did not find the row implied by structured tool activity at verification time.",
  robots: { index: true, follow: true },
  alternates: { canonical: indexableExampleCanonical(path) },
};

export default function ExampleWfMissingPage() {
  const e = getIndexableExample(path);
  return (
    <main className="integrate-main">
      <h1>{e.navLabel}</h1>
      <p className="lede">{e.problemAnchor}</p>
      <p className="lede">
        The embed below is the same <strong>ROW_ABSENT</strong> contrast used on indexable guides: trace-shaped
        success language with a missing row at read-only SQL verification time. Follow{" "}
        <Link href="/integrate">/integrate</Link> to reproduce the pattern on your Postgres or SQLite database.
      </p>
      <ExampleVerificationEmbed variant="wf_missing" />
      <p className="home-cta-row">
        <Link className="btn" href="/integrate">
          Run first-run integration
        </Link>
      </p>
    </main>
  );
}
