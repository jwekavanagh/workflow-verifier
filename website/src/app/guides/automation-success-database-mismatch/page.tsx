import { IndexedGuideShell } from "@/components/guides/IndexedGuideShell";
import { getIndexableGuide, indexableGuideCanonical } from "@/lib/indexableGuides";
import type { Metadata } from "next";

const path = "/guides/automation-success-database-mismatch";

export const metadata: Metadata = {
  title: "Automation success vs database mismatch — AgentSkeptic",
  description:
    "Automation pipelines report success while Postgres or SQLite rows disagree with tool parameters; AgentSkeptic runs read-only SQL checks at verification time against structured activity.",
  robots: { index: true, follow: true },
  alternates: { canonical: indexableGuideCanonical(path) },
};

export default function AutomationSuccessMismatchGuidePage() {
  const g = getIndexableGuide(path);
  return (
    <IndexedGuideShell>
      <h1>Automation success vs database mismatch</h1>
      <p className="lede">{g.problemAnchor}</p>
      <p className="lede">
        Treat batch success flags as non-authoritative: run read-only SQL that compares declared parameters to
        observed rows at verification time using AgentSkeptic contract or Quick Verify paths.
      </p>
      <p className="lede">
        Follow <code>/integrate</code> for a copy-paste first run on your database, then wire structured events plus a
        tools registry for repeatable read-only checks in CI.
      </p>
      <ol className="mechanism-list">
        <li>Log structured tool observations from the automation step that claims success.</li>
        <li>
          Verify with read-only SQL against the same tables your operators trust—catching missing rows even when logs
          read green.
        </li>
      </ol>
    </IndexedGuideShell>
  );
}
