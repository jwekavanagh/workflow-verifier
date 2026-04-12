import { productCopy } from "@/content/productCopy";
import discoveryAcquisition from "@/lib/discoveryAcquisition";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: discoveryAcquisition.pageMetadata.title,
  description: discoveryAcquisition.pageMetadata.description,
};

export default function DatabaseTruthVsTracesPage() {
  const { why, what, when } = productCopy.homepageHeroNarrative;
  const visitorParagraphs = discoveryAcquisition.visitorProblemAnswer.split(/\n\n+/).filter(Boolean);

  return (
    <main className="integrate-main">
      <h1 data-testid="acquisition-hero-title">{discoveryAcquisition.heroTitle}</h1>
      <div data-testid="visitor-problem-answer">
        {visitorParagraphs.map((p) => (
          <p key={p.slice(0, 64)} className="lede">
            {p}
          </p>
        ))}
      </div>
      <p className="lede">{discoveryAcquisition.heroSubtitle}</p>
      <section className="home-section" data-testid="acquisition-terminal-demo" aria-labelledby="terminal-demo-heading">
        <h2 id="terminal-demo-heading">{discoveryAcquisition.shareableTerminalDemo.title}</h2>
        <pre className="truth-report-pre">{discoveryAcquisition.shareableTerminalDemo.transcript}</pre>
      </section>
      {discoveryAcquisition.sections.map((section) => (
        <section key={section.heading} className="home-section">
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 64)}>{paragraph}</p>
          ))}
        </section>
      ))}
      <section className="home-section" aria-labelledby="acquisition-deep-context">
        <h2 id="acquisition-deep-context">{productCopy.acquisitionDeepContextSectionTitle}</h2>
        <p className="lede">{why}</p>
        <p className="lede">{what}</p>
        <p className="lede">{when}</p>
      </section>
    </main>
  );
}
