import Link from "next/link";
import { publicProductAnchors } from "@/lib/publicProductAnchors";
import {
  buildSiteFooterLegalLinks,
  buildSiteFooterProductLinks,
  openapiHrefFromProcessEnv,
} from "@/lib/siteChrome";

export function SiteFooter() {
  const anchors = {
    gitRepositoryUrl: publicProductAnchors.gitRepositoryUrl,
    npmPackageUrl: publicProductAnchors.npmPackageUrl,
    bugsUrl: publicProductAnchors.bugsUrl,
  };
  const openapiHref = openapiHrefFromProcessEnv();
  const productLinks = buildSiteFooterProductLinks({ anchors, openapiHref });
  const legalLinks = buildSiteFooterLegalLinks();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <nav aria-label="Product links">
          {productLinks.map((link, i) => (
            <span key={link.key}>
              {i > 0 ? <span className="site-footer-sep"> · </span> : null}
              {link.external ? (
                <a href={link.href} rel="noreferrer">
                  {link.label}
                </a>
              ) : (
                <Link href={link.href}>{link.label}</Link>
              )}
            </span>
          ))}
        </nav>
        <nav aria-label="Trust and legal">
          {legalLinks.map((link, i) => (
            <span key={link.key}>
              {i > 0 ? <span className="site-footer-sep"> · </span> : null}
              <Link href={link.href}>{link.label}</Link>
            </span>
          ))}
        </nav>
      </div>
    </footer>
  );
}
