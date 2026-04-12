import { productCopy } from "@/content/productCopy";
import { publicProductAnchors } from "@/lib/publicProductAnchors";
import { buildHomeTrustStripLinks, openapiHrefFromProcessEnv } from "@/lib/siteChrome";
import Link from "next/link";
import { Fragment } from "react";
import { TryItSection } from "./home/TryItSection";
import { HOME_SECTION_ORDER, type HomeSectionId } from "./page.sections";

const anchors = {
  gitRepositoryUrl: publicProductAnchors.gitRepositoryUrl,
  npmPackageUrl: publicProductAnchors.npmPackageUrl,
  bugsUrl: publicProductAnchors.bugsUrl,
};

export default function HomePage() {
  const trustLinks = buildHomeTrustStripLinks({
    anchors,
    acquisitionHref: productCopy.homepageAcquisitionCta.href,
    openapiHref: openapiHrefFromProcessEnv(),
  });

  const sectionRenderers: Record<HomeSectionId, React.ReactNode> = {
    hero: (
      <section
        key="hero"
        className="home-section home-hero"
        data-testid={productCopy.uiTestIds.hero}
        aria-labelledby="hero-heading"
      >
        <div className="home-hero-grid">
          <div className="home-hero-copy">
            <h1 id="hero-heading">{productCopy.hero.title}</h1>
            <p className="lede">{productCopy.homepageDecisionFraming}</p>
            <p className="lede">{productCopy.hero.subtitle}</p>
            <p className="home-cta-row" data-testid="home-hero-cta-row">
              <Link className="btn" href="/pricing">
                {productCopy.homeHeroCtaLabels.pricing}
              </Link>
              <a className="btn secondary" href="#try-it">
                {productCopy.homeHeroCtaLabels.verify}
              </a>
              <Link
                className="link-secondary"
                href={productCopy.homepageAcquisitionCta.href}
                data-testid={productCopy.homepageAcquisitionCta.testId}
              >
                {productCopy.homepageAcquisitionCta.label}
              </Link>
            </p>
          </div>
        </div>
      </section>
    ),
    homeTrustStrip: (
      <section
        key="homeTrustStrip"
        className="home-trust-strip"
        data-testid="home-trust-strip"
        aria-labelledby="home-trust-strip-heading"
      >
        <h2 id="home-trust-strip-heading" className="home-trust-strip-heading">
          {productCopy.homeTrustStripSectionHeading}
        </h2>
        <ul className="home-trust-strip-list">
          {trustLinks.map((item) => (
            <li key={item.key} data-testid={`home-trust-strip-${item.key}`}>
              {item.external ? (
                <a href={item.href} rel="noreferrer" target="_blank">
                  {item.label}
                </a>
              ) : (
                <a href={item.href}>{item.label}</a>
              )}
            </li>
          ))}
        </ul>
      </section>
    ),
    howItWorks: (
      <section
        key="howItWorks"
        className="home-section"
        data-testid={productCopy.uiTestIds.howItWorks}
        aria-labelledby="how-it-works-heading"
      >
        <h2 id="how-it-works-heading">{productCopy.howItWorks.sectionTitle}</h2>
        <p>{productCopy.scenario.body}</p>
        <div className="before-after">
          <div>
            <h3 className="before-after-label">{productCopy.scenario.beforeLabel}</h3>
            <p>{productCopy.scenario.before}</p>
          </div>
          <div>
            <h3 className="before-after-label">{productCopy.scenario.afterLabel}</h3>
            <p>{productCopy.scenario.after}</p>
          </div>
        </div>
        <h3>{productCopy.mechanism.title}</h3>
        <ol className="mechanism-list">
          {productCopy.mechanism.items.map((item) => (
            <li key={item.slice(0, 48)}>{item}</li>
          ))}
        </ol>
        <p className="muted">{productCopy.mechanism.notObservability}</p>
        <p className="muted">
          <Link href="/security">Security & Trust</Link> — trust boundary and what verification does not guarantee.
        </p>
      </section>
    ),
    fitAndLimits: (
      <section
        key="fitAndLimits"
        className="home-section"
        data-testid={productCopy.uiTestIds.fitAndLimits}
        aria-labelledby="fit-limits-heading"
      >
        <h2 id="fit-limits-heading">{productCopy.fitAndLimits.sectionTitle}</h2>
        <h3>For you</h3>
        <ul>
          {productCopy.forYou.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <h3>Not for you</h3>
        <ul>
          {productCopy.notForYou.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <h3 className="guarantee-sub">Guaranteed</h3>
        <ul>
          {productCopy.guarantees.guaranteed.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <h3 className="guarantee-sub">Not guaranteed</h3>
        <ul>
          {productCopy.guarantees.notGuaranteed.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
    ),
    tryIt: <TryItSection key="tryIt" />,
    commercialSurface: (
      <section
        key="commercialSurface"
        className="home-section"
        data-testid={productCopy.uiTestIds.commercialSurface}
        aria-labelledby="commercial-surface-heading"
      >
        <h2 id="commercial-surface-heading">{productCopy.commercialSurface.title}</h2>
        <p>{productCopy.commercialSurface.lead}</p>
        <p className="commercial-links">
          <Link href="/pricing">Pricing</Link>
          {" · "}
          <Link href="/account">Account</Link>
          {" · "}
          <a href={productCopy.links.openapiCommercial}>OpenAPI</a>
        </p>
      </section>
    ),
  };

  return (
    <main>
      {HOME_SECTION_ORDER.map((id) => (
        <Fragment key={id}>{sectionRenderers[id]}</Fragment>
      ))}
    </main>
  );
}
