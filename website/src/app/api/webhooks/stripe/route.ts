import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/db/client";
import { stripeEvents } from "@/db/schema";
import { applyStripeWebhookEvent } from "@/lib/applyStripeWebhookEvent";
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

  const existing = await db
    .select()
    .from(stripeEvents)
    .where(eq(stripeEvents.id, event.id))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  await db.insert(stripeEvents).values({ id: event.id });

  try {
    await applyStripeWebhookEvent(event);
  } catch (e) {
    console.error(e);
    return new NextResponse("Handler error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
