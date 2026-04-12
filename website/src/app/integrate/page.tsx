import { productCopy } from "@/content/productCopy";
import { siteMetadata } from "@/content/siteMetadata";
import { embeddedFirstRunIntegrationMd } from "@/generated/integratorDocsEmbedded";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FirstRunActivationGuide } from "./FirstRunActivationGuide";

export const metadata: Metadata = {
  title: siteMetadata.integrate.title,
  description: siteMetadata.integrate.description,
};

export default function IntegratePage() {
  const md = embeddedFirstRunIntegrationMd;
  return (
    <main className="integrate-main">
      <h1>{siteMetadata.integrate.title}</h1>
      <p className="muted">{productCopy.integrateIntro}</p>
      <FirstRunActivationGuide />
      <details className="integrate-full-doc-details">
        <summary className="integrate-full-doc-summary">{productCopy.integrateFullGuideSummary}</summary>
        <article className="integrate-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
        </article>
      </details>
    </main>
  );
}
