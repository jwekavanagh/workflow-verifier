import { auth } from "@/auth";
import { loadCommercialPlans } from "@/lib/plans";
import type { PlanId } from "@/lib/plans";
import { NextRequest, NextResponse } from "next/server";
import { logFunnelEvent } from "@/lib/funnelEvent";
import { getStripe } from "@/lib/stripeServer";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let plan: PlanId;
  try {
    const j = (await req.json()) as { plan?: PlanId };
    if (j.plan !== "team" && j.plan !== "business") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    plan = j.plan;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const plans = loadCommercialPlans();
  const def = plans.plans[plan];
  const envKey = def.stripePriceEnvKey;
  if (!envKey) {
    return NextResponse.json({ error: "Plan not billable" }, { status: 400 });
  }
  const priceId = process.env[envKey];
  if (!priceId) {
    return NextResponse.json({ error: "Missing Stripe price env" }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";

  const checkout = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: session.user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/account?checkout=success`,
    cancel_url: `${base}/pricing`,
    metadata: {
      userId: session.user.id,
      plan,
    },
  });

  await logFunnelEvent({ event: "checkout_started", userId: session.user.id });

  return NextResponse.json({ url: checkout.url });
}
