import { IndexedGuideShell } from "@/components/guides/IndexedGuideShell";
import { getIndexableGuide, indexableGuideCanonical } from "@/lib/indexableGuides";
import type { Metadata } from "next";

const path = "/guides/debug-postgres-after-langgraph";

export const metadata: Metadata = {
  title: "Debug Postgres after LangGraph — AgentSkeptic",
  description:
    "After LangGraph runs traces look complete yet Postgres state is wrong; use structured tool activity plus read-only SQL verification at verification time instead of trusting trace completion alone.",
  robots: { index: true, follow: true },
  alternates: { canonical: indexableGuideCanonical(path) },
};

export default function DebugPostgresLangGraphGuidePage() {
  const g = getIndexableGuide(path);
  return (
    <IndexedGuideShell>
      <h1>Debug Postgres after LangGraph runs</h1>
      <p className="lede">{g.problemAnchor}</p>
      <p className="lede">
        LangGraph gives rich traces; AgentSkeptic adds read-only SQL truth for the rows your graph implied—still a
        snapshot at verification time, not proof a tool executed.
      </p>
      <p className="lede">
        Use <code>/integrate</code> to mirror the bundled demo on your Postgres instance, exporting the same NDJSON
        shapes your graph already produces for tools.
      </p>
      <ol className="mechanism-list">
        <li>Export structured tool parameters from the graph run you are debugging.</li>
        <li>
          Compare them with read-only <code>SELECT</code>s via contract verification so missing rows surface as{" "}
          <code>ROW_ABSENT</code> instead of silent drift.
        </li>
      </ol>
    </IndexedGuideShell>
  );
}
