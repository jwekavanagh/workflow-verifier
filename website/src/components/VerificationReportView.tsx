import { productCopy } from "@/content/productCopy";
import type { PublicReportEnvelope } from "@/lib/publicVerificationReportService";

type Props = {
  humanText: string;
  payload: PublicReportEnvelope;
};

export function VerificationReportView({ humanText, payload }: Props) {
  const machineJson =
    payload.kind === "workflow"
      ? JSON.stringify(payload.workflowResult, null, 2)
      : JSON.stringify(payload.quickReport, null, 2);
  return (
    <article className="integrate-main" data-testid="verification-report-view">
      <h1>Verification report</h1>
      <p className="muted">{productCopy.publicShareReportIntro}</p>
      <p className="muted">
        Kind: <strong>{payload.kind}</strong>
      </p>
      <section className="home-section" aria-labelledby="human-heading">
        <h2 id="human-heading">Human report</h2>
        <pre className="truth-report-pre" data-testid="verification-report-human">
          {humanText}
        </pre>
      </section>
      <section className="home-section" aria-labelledby="machine-heading">
        <h2 id="machine-heading">Machine JSON</h2>
        <pre className="truth-report-pre" data-testid="verification-report-machine">
          {machineJson}
        </pre>
      </section>
    </article>
  );
}
