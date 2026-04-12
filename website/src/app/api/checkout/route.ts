import { auth } from "@/auth";
import { db } from "@/db/client";
import { funnelEvents, users } from "@/db/schema";
import {
  buildCheckoutStartedMetadata,
  type CheckoutStartedMetadata,
} from "@/lib/funnelCommercialMetadata";
import { logFunnelEvent } from "@/lib/funnelEvent";
import { loadCommercialPlans } from "@/lib/plans";
import type { PlanId } from "@/lib/plans";
import { checkoutStripePriceFromEnvKey } from "@/lib/priceIdToPlanId";
import { isStripeMissingCustomerError } from "@/lib/stripeMissingCustomerError";
import { buildStripeCheckoutSessionCreateParams } from "@/lib/stripeCheckoutSessionParams";
import { getStripe } from "@/lib/stripeServer";
import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let plan: PlanId;
  let envKey: string;
  try {
    const j = (await req.json()) as { plan?: unknown };
    const raw = j.plan;
    if (typeof raw !== "string") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    const plans = loadCommercialPlans();
    const def = plans.plans[raw as PlanId];
    if (!def) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    const key = def.stripePriceEnvKey;
    if (!key) {
      return NextResponse.json({ error: "Plan not billable" }, { status: 400 });
    }
    plan = raw as PlanId;
    envKey = key;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const priceId = checkoutStripePriceFromEnvKey(envKey);
  if (!priceId) {
    return NextResponse.json({ error: "Missing Stripe price env" }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";

  const [urow] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const trimmedStoredCustomerId =
    typeof urow?.stripeCustomerId === "string" ? urow.stripeCustomerId.trim() : "";

  const priorReserve = await db
    .select()
    .from(funnelEvents)
    .where(
      and(eq(funnelEvents.userId, session.user.id), eq(funnelEvents.event, "reserve_allowed")),
    )
    .limit(1);
  const postActivation = priorReserve.length > 0;

  const sessionParams = buildStripeCheckoutSessionCreateParams({
    stripeCustomerId: urow?.stripeCustomerId,
    customerEmail: session.user.email,
    priceId,
    baseUrl: base,
    plan,
    userId: session.user.id,
  });

  const stripe = getStripe();

  async function createCheckoutAndRespond(
    params: Stripe.Checkout.SessionCreateParams,
  ): Promise<NextResponse> {
    const checkout = await stripe.checkout.sessions.create(params);
    const url = checkout.url;
    if (!url) {
      return NextResponse.json(
        { error: "Checkout session did not return a redirect URL." },
        { status: 502 },
      );
    }

    await logFunnelEvent({
      event: "checkout_started",
      userId: session.user.id,
      metadata: buildCheckoutStartedMetadata(
        plan as CheckoutStartedMetadata["plan"],
        postActivation,
      ),
    });

    return NextResponse.json({ url });
  }

  try {
    return await createCheckoutAndRespond(sessionParams);
  } catch (e) {
    if (trimmedStoredCustomerId.length > 0 && isStripeMissingCustomerError(e)) {
      await db.update(users).set({ stripeCustomerId: null }).where(eq(users.id, session.user.id));
      const fallbackParams = buildStripeCheckoutSessionCreateParams({
        stripeCustomerId: null,
        customerEmail: session.user.email,
        priceId,
        baseUrl: base,
        plan,
        userId: session.user.id,
      });
      try {
        return await createCheckoutAndRespond(fallbackParams);
      } catch (e2) {
        const message =
          e2 instanceof Error ? e2.message : "Checkout failed. Please try again or contact support.";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }
    const message =
      e instanceof Error ? e.message : "Checkout failed. Please try again or contact support.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
