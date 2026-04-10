import { productCopy } from "@/content/productCopy";
import { enterpriseMailtoHref } from "@/lib/contactSalesEmail";
import { loadCommercialPlans } from "@/lib/plans";
import { PricingClient, type PlanRow } from "./PricingClient";

export default function PricingPage() {
  const { plans: raw } = loadCommercialPlans();
  const order = ["starter", "team", "business", "enterprise"] as const;
  const plans: PlanRow[] = order.map((id) => {
    const p = raw[id];
    return {
      id,
      headline: p.marketingHeadline,
      displayPrice: p.displayPrice,
      includedMonthly: p.includedMonthly,
      audience: p.audience,
      valueUnlock: p.valueUnlock,
    };
  });
  const enterpriseMailto = enterpriseMailtoHref();
  return (
    <main>
      <h1>Pricing</h1>
      <p className="muted pricing-recap">{productCopy.pricingRecap}</p>
      <PricingClient plans={plans} enterpriseMailto={enterpriseMailto} />
    </main>
  );
}
