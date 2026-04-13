import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/db/client";
import { stripeEvents } from "@/db/schema";
import {
  applyStripeWebhookDbSide,
  type StripeWebhookDbContext,
} from "@/lib/applyStripeWebhookDbSide";
import { getStripe } from "@/lib/stripeServer";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret || !sig) {
    return new NextResponse("Missing webhook configuration", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, whSecret);
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  const ctx: StripeWebhookDbContext = {};
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const subRef = session.subscription;
    const subId = typeof subRef === "string" ? subRef : subRef?.id;
    if (userId && subId) {
      ctx.checkoutSubscription = await getStripe().subscriptions.retrieve(subId, {
        expand: ["items.data.price"],
      });
    }
  }

  let duplicate = false;
  try {
    duplicate = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(stripeEvents)
        .values({ id: event.id })
        .onConflictDoNothing()
        .returning({ id: stripeEvents.id });
      if (inserted.length === 0) {
        return true;
      }
      await applyStripeWebhookDbSide(tx, event, ctx);
      return false;
    });
  } catch (e) {
    console.error(e);
    return new NextResponse("Handler error", { status: 500 });
  }

  if (duplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  return NextResponse.json({ received: true });
}
