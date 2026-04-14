import { productCopy } from "@/content/productCopy";
import { enterpriseMailtoHref } from "@/lib/contactSalesEmail";
import { loadCommercialPlans, type PlanId } from "@/lib/plans";
import Link from "next/link";
import { PricingClient, type PlanRow } from "./PricingClient";

export const dynamic = "force-dynamic";

function PricingCompareTable() {
  const compare = productCopy.pricingFeatureComparison;
  return (
    <section
      className="pricing-compare"
      aria-labelledby="pricing-compare-title"
      data-testid="pricing-compare-section"
    >
      <h2 id="pricing-compare-title" className="pricing-compare-heading">
        {compare.title}
      </h2>
      <div className="pricing-compare-scroll">
        <table className="pricing-compare-table">
          <thead>
            <tr>
              {compare.columnLabels.map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compare.rows.map((row) => (
              <tr key={row.feature}>
                <th scope="row">{row.feature}</th>
                <td>{row.starter}</td>
                <td>{row.individual}</td>
                <td>{row.team}</td>
                <td>{row.business}</td>
                <td>{row.enterprise}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PricingPage() {
  const commercial = loadCommercialPlans();
  const raw = commercial.plans;
  const order: PlanId[] = ["starter", "individual", "team", "business", "enterprise"];
  const recommendedPlanId = commercial.recommendedPlanId;
  const plans: PlanRow[] = order.map((id) => {
    const p = raw[id];
    return {
      id,
      checkoutPlanId: p.stripePriceEnvKey !== null ? id : null,
      headline: p.marketingHeadline,
      displayPrice: p.displayPrice,
      includedMonthly: p.includedMonthly,
      audience: p.audience,
      valueUnlock: p.valueUnlock,
      recommended: id === recommendedPlanId,
    };
  });
  const enterpriseMailto = enterpriseMailtoHref();
  const hero = productCopy.pricingHero;
  const example = productCopy.pricingHeroExample;

  return (
    <main className="pricing-page">
      <h1 className="pricing-hero-title">{hero.title}</h1>
      <p className="pricing-positioning">{hero.positioning}</p>
      <section className="pricing-hero-block" data-testid="pricing-hero-recap" aria-label="Pricing summary">
        <p className="pricing-hero-subtitle" data-testid="pricing-plan-choice-guide">
          {hero.subtitle}
        </p>
        <p className="pricing-hero-one-liner muted">{hero.tierSummaryOneLine}</p>
      </section>

      <section className="pricing-example" data-testid="pricing-example" aria-labelledby="pricing-example-title">
        <h2 id="pricing-example-title" className="pricing-example-heading">
          {example.title}
        </h2>
        <ul>
          {example.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>

      <p className="pricing-risk muted" data-testid="pricing-risk-reassurance">
        {productCopy.pricingRiskReassurance}
      </p>

      <PricingClient plans={plans} enterpriseMailto={enterpriseMailto} />

      <PricingCompareTable />

      <ul aria-label="Commercial terms" className="muted pricing-commercial-terms">
        {productCopy.pricingCommercialTermsBullets.map((row) => (
          <li key={row.lead}>
            <strong>{row.lead}</strong> {row.body}
          </li>
        ))}
      </ul>

      <section data-testid="pricing-trust-band" aria-labelledby="pricing-trust-band-title">
        <h2 id="pricing-trust-band-title">{productCopy.pricingTrustBandBeforeGrid.title}</h2>
        <p>{productCopy.pricingTrustBandBeforeGrid.paragraphs[0]}</p>
        <p>{productCopy.pricingTrustBandBeforeGrid.paragraphs[1]}</p>
        <p className="pricing-trust-band-links">
          <Link href={productCopy.pricingTrustBandBeforeGrid.links[0].href}>
            {productCopy.pricingTrustBandBeforeGrid.links[0].label}
          </Link>
          <span className="pricing-trust-band-links-sep" aria-hidden="true">
            ·
          </span>
          <Link href={productCopy.pricingTrustBandBeforeGrid.links[1].href}>
            {productCopy.pricingTrustBandBeforeGrid.links[1].label}
          </Link>
        </p>
      </section>
    </main>
  );
}
