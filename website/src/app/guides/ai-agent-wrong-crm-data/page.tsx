import { IndexedGuideShell } from "@/components/guides/IndexedGuideShell";
import { getIndexableGuide, indexableGuideCanonical } from "@/lib/indexableGuides";
import type { Metadata } from "next";

const path = "/guides/ai-agent-wrong-crm-data";

export const metadata: Metadata = {
  title: "AI agent wrong CRM data read-only SQL — AgentSkeptic",
  description:
    "Your AI agent updated CRM fields but read-only SQL at verification time shows missing or wrong rows compared to structured tool activity—not green chat or trace flags alone.",
  robots: { index: true, follow: true },
  alternates: { canonical: indexableGuideCanonical(path) },
};

export default function AiAgentWrongCrmGuidePage() {
  const g = getIndexableGuide(path);
  return (
    <IndexedGuideShell>
      <h1>AI agent wrong CRM data read-only check</h1>
      <p className="lede">{g.problemAnchor}</p>
      <p className="lede">
        When dashboards stay green, AgentSkeptic still answers with read-only <code>SELECT</code>s against your
        SQLite or Postgres—comparing structured tool parameters to persisted rows at verification time.
      </p>
      <p className="lede">
        Start from <code>/integrate</code> to emit NDJSON observations and run contract verification locally; keep
        private share links on <code>/r/</code> (noindex) while you iterate.
      </p>
      <ol className="mechanism-list">
        <li>
          Capture structured tool activity from the CRM path your agent touched (IDs and fields in JSON or NDJSON).
        </li>
        <li>
          Map each <code>toolId</code> to a registry entry or use Quick Verify for inferred checks, then run read-only
          SQL verification before you trust customer-facing state.
        </li>
      </ol>
    </IndexedGuideShell>
  );
}
