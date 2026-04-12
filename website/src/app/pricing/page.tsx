import { productCopy } from "@/content/productCopy";
import { enterpriseMailtoHref } from "@/lib/contactSalesEmail";
import { loadCommercialPlans, type PlanId } from "@/lib/plans";
import Link from "next/link";
import { PricingClient, type PlanRow } from "./PricingClient";

export const dynamic = "force-dynamic";

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
  return (
    <main>
      <h1>Pricing</h1>
      <p className="muted pricing-recap">{productCopy.pricingRecap}</p>
      <p className="muted pricing-oss-reminder" data-testid="pricing-oss-reminder">
        {productCopy.pricingOssPathReminder}
      </p>
      <ul aria-label="Commercial terms" className="muted" style={{ marginTop: "1rem", maxWidth: "42rem" }}>
        {productCopy.pricingCommercialTermsBullets.map((row) => (
          <li key={row.lead} style={{ marginBottom: "0.5rem" }}>
            <strong>{row.lead}</strong> {row.body}
          </li>
        ))}
      </ul>
      <section data-testid="pricing-trust-band" aria-labelledby="pricing-trust-band-title">
        <h2 id="pricing-trust-band-title">{productCopy.pricingTrustBandBeforeGrid.title}</h2>
        <p>{productCopy.pricingTrustBandBeforeGrid.paragraphs[0]}</p>
        <p>{productCopy.pricingTrustBandBeforeGrid.paragraphs[1]}</p>
        <p>
          <Link href={productCopy.pricingTrustBandBeforeGrid.links[0].href}>
            {productCopy.pricingTrustBandBeforeGrid.links[0].label}
          </Link>
          {" · "}
          <Link href={productCopy.pricingTrustBandBeforeGrid.links[1].href}>
            {productCopy.pricingTrustBandBeforeGrid.links[1].label}
          </Link>
        </p>
      </section>
      <PricingClient plans={plans} enterpriseMailto={enterpriseMailto} />
    </main>
  );
}
