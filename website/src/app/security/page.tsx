import { productCopy } from "@/content/productCopy";
import { siteMetadata } from "@/content/siteMetadata";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: siteMetadata.security.title,
  description: siteMetadata.security.description,
};

export default function SecurityPage() {
  const st = productCopy.securityTrust;
  return (
    <main className="integrate-main">
      <h1>{st.title}</h1>
      <p className="lede">{st.intro}</p>
      <section data-testid="security-quick-facts" aria-labelledby="security-quick-facts-title">
        <h2 id="security-quick-facts-title">{productCopy.securityQuickFacts.title}</h2>
        <ul>
          {productCopy.securityQuickFacts.bullets.map((t, i) => (
            <li key={`sq-${i}`}>{t}</li>
          ))}
        </ul>
      </section>
      {st.sections.map((section) => (
        <section key={section.heading} className="home-section">
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 64)}>{paragraph}</p>
          ))}
        </section>
      ))}
      <section className="home-section" aria-labelledby="security-doc-links">
        <h2 id="security-doc-links">Authoritative documentation</h2>
        <ul>
          <li>
            <a href={st.docLinks.verificationProductSsot} rel="noreferrer">
              Verification product SSOT (trust boundary)
            </a>
          </li>
          <li>
            <a href={st.docLinks.commercialSsot} rel="noreferrer">
              Commercial SSOT
            </a>
          </li>
          <li>
            <Link href="/privacy">Privacy</Link>
          </li>
          <li>
            <Link href="/terms">Terms</Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
