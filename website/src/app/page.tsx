import { productCopy } from "@/content/productCopy";
import Link from "next/link";
import { Fragment } from "react";
import { TryItSection } from "./home/TryItSection";
import { HOME_SECTION_ORDER, type HomeSectionId } from "./page.sections";

export default function HomePage() {
  const sectionRenderers: Record<HomeSectionId, React.ReactNode> = {
    hero: (
      <section
        key="hero"
        className="home-section"
        data-testid={productCopy.uiTestIds.hero}
        aria-labelledby="hero-heading"
      >
        <h1 id="hero-heading">{productCopy.hero.title}</h1>
        <p className="lede">{productCopy.homepageDecisionFraming}</p>
        <p className="lede">{productCopy.hero.subtitle}</p>
        <p className="home-cta-row" data-testid="home-hero-cta-row">
          <a className="btn" href="#try-it">
            Run verification
          </a>
          <Link
            className="link-secondary"
            href={productCopy.homepageAcquisitionCta.href}
            data-testid={productCopy.homepageAcquisitionCta.testId}
          >
            {productCopy.homepageAcquisitionCta.label}
          </Link>
        </p>
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
