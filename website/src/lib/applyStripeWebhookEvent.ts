import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { logFunnelEvent } from "@/lib/funnelEvent";
import type { PlanId } from "@/lib/plans";
import { subscriptionStatusFromStripe } from "@/lib/stripeSubscriptionStatus";

/**
 * Stripe webhook business logic (user updates + funnel). Caller must handle idempotency and
 * `stripe_event` insert before invoking this.
 */
export async function applyStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const plan = session.metadata?.plan as PlanId | undefined;
    if (userId && plan) {
      const updated = await db
        .update(users)
        .set({
          plan,
          subscriptionStatus: "active",
          stripeCustomerId:
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id ?? null,
          stripeSubscriptionId:
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id ?? null,
        })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      if (updated.length > 0) {
        await logFunnelEvent({
          event: "subscription_checkout_completed",
          userId,
          metadata: { plan },
        });
      }
    }
  }

  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const nextStatus = subscriptionStatusFromStripe(sub.status);
    await db
      .update(users)
      .set({ subscriptionStatus: nextStatus })
      .where(eq(users.stripeCustomerId, customerId));
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    await db
      .update(users)
      .set({ subscriptionStatus: "inactive" })
      .where(eq(users.stripeCustomerId, customerId));
  }
}
