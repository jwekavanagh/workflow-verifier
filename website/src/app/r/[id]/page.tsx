import { VerificationReportView } from "@/components/VerificationReportView";
import type { PublicReportEnvelope } from "@/lib/publicVerificationReportService";
import { selectPublicVerificationReportById } from "@/lib/publicVerificationReportService";
import { logFunnelEvent } from "@/lib/funnelEvent";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function publicReportsEnabled(): boolean {
  return process.env.PUBLIC_VERIFICATION_REPORTS_ENABLED === "1";
}

function collapseWhitespace(s: string, maxLen: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= maxLen ? one : one.slice(0, maxLen);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!publicReportsEnabled()) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }
  const row = await selectPublicVerificationReportById(id);
  if (!row) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }
  const title = `AgentSkeptic report — ${row.reportWorkflowId} — ${row.reportStatusToken}`;
  const description = collapseWhitespace(row.humanText, 240);
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PublicReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!publicReportsEnabled()) {
    notFound();
  }
  const row = await selectPublicVerificationReportById(id);
  if (!row) {
    notFound();
  }
  await logFunnelEvent({ event: "report_share_view", metadata: { id } });
  const payload = row.payload as unknown as PublicReportEnvelope;
  return <VerificationReportView humanText={row.humanText} payload={payload} variant="standalone" />;
}
