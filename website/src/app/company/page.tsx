import { productCopy } from "@/content/productCopy";
import { siteMetadata } from "@/content/siteMetadata";
import { publicProductAnchors } from "@/lib/publicProductAnchors";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: siteMetadata.company.title,
  description: siteMetadata.company.description,
};

export default function CompanyPage() {
  const { companyPage: page } = productCopy;

  return (
    <main className="integrate-main">
      <h1>{page.h1}</h1>
      <p className="lede">{page.intro}</p>
      {page.sections.map((s) => {
        if (s.kind === "supportIssues") {
          return (
            <section key={s.kind} className="home-section">
              <h2>{s.h2}</h2>
              <p>{s.paragraph}</p>
              <p>
                <a
                  data-testid="company-issues-link"
                  href={publicProductAnchors.bugsUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {s.issuesLinkLabel}
                </a>
              </p>
            </section>
          );
        }
        if (s.kind === "buying") {
          return (
            <section key={s.kind} className="home-section">
              <h2>{s.h2}</h2>
              <p>{s.paragraph}</p>
              <p>
                <Link href={s.cta.href}>{s.cta.label}</Link>
              </p>
            </section>
          );
        }
        if (s.kind === "legal") {
          return (
            <section key={s.kind} className="home-section">
              <h2>{s.h2}</h2>
              <ul>
                {s.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        }
        if (s.kind === "artifacts") {
          return (
            <section key={s.kind} className="home-section">
              <h2>{s.h2}</h2>
              <ul>
                {s.items.map((it) => (
                  <li key={it.key}>
                    <a
                      href={
                        it.key === "source"
                          ? publicProductAnchors.gitRepositoryUrl
                          : publicProductAnchors.npmPackageUrl
                      }
                      rel="noreferrer"
                      target="_blank"
                    >
                      {it.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        }
        return null;
      })}
    </main>
  );
}
