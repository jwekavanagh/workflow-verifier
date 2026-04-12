import { IndexedGuideShell } from "@/components/guides/IndexedGuideShell";
import { getIndexableGuide, indexableGuideCanonical } from "@/lib/indexableGuides";
import type { Metadata } from "next";

const path = "/guides/ci-green-missing-database-side-effect";

export const metadata: Metadata = {
  title: "CI green missing database side effect — AgentSkeptic",
  description:
    "CI stays green on workflow logs while the database side effect never appears; gate merges with read-only SQL verification at verification time to catch ROW_ABSENT style gaps before production.",
  robots: { index: true, follow: true },
  alternates: { canonical: indexableGuideCanonical(path) },
};

export default function CiGreenMissingSideEffectGuidePage() {
  const g = getIndexableGuide(path);
  return (
    <IndexedGuideShell>
      <h1>CI green but missing database side effect</h1>
      <p className="lede">{g.problemAnchor}</p>
      <p className="lede">
        CI can stay green when logs never hit the database row your workflow promised; add read-only SQL verification
        that reads structured tool activity the same way AgentSkeptic does in the bundled demos.
      </p>
      <p className="lede">
        Copy the <code>/integrate</code> first-run flow into your pipeline so every PR runs read-only checks against a
        pinned database fixture or ephemeral Postgres before merge.
      </p>
      <ol className="mechanism-list">
        <li>Replay workflow logs into NDJSON observations for the side-effect tools you care about.</li>
        <li>
          Fail the job when read-only SQL returns <code>ROW_ABSENT</code> or field mismatches—even if the trace step
          logged success.
        </li>
      </ol>
    </IndexedGuideShell>
  );
}
