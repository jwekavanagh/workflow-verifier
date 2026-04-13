import { and, eq, or, isNull } from "drizzle-orm";
import type Stripe from "stripe";
import { users } from "@/db/schema";
import type { AppDbClient } from "@/lib/funnelEvent";
import { logFunnelEvent } from "@/lib/funnelEvent";
import type { PlanId } from "@/lib/plans";
import { primarySubscriptionPriceId, priceIdToPlanId } from "@/lib/priceIdToPlanId";
import { subscriptionStatusFromStripe } from "@/lib/stripeSubscriptionStatus";

export type StripeWebhookDbContext = {
  checkoutSubscription?: Stripe.Subscription | null;
};

function customerIdOf(sub: Stripe.Subscription): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

function subscriptionPatchFromStripe(sub: Stripe.Subscription, priorPlan: PlanId) {
  const priceId = primarySubscriptionPriceId(sub);
  const mappedPlan = priceIdToPlanId(priceId);
  if (mappedPlan === null && priceId) {
    console.error(
      JSON.stringify({
        kind: "stripe_price_unmapped",
        priceId,
        subscriptionId: sub.id,
        customerId: customerIdOf(sub),
      }),
    );
  }
  const nextPlan: PlanId = mappedPlan ?? priorPlan;
  return {
    plan: nextPlan,
    subscriptionStatus: subscriptionStatusFromStripe(sub.status),
    stripeCustomerId: customerIdOf(sub),
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
  };
}

/**
 * Stripe webhook DB mutations only (no network I/O). Caller owns `stripe_event` claim insert in the same transaction.
 */
export async function applyStripeWebhookDbSide(
  tx: AppDbClient,
  event: Stripe.Event,
  ctx: StripeWebhookDbContext,
): Promise<void> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const subRef = session.subscription;
    const subId = typeof subRef === "string" ? subRef : subRef?.id;
    if (!userId || !subId) {
      return;
    }
    const sub = ctx.checkoutSubscription;
    if (!sub) {
      return;
    }
    const [existing] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existing) {
      return;
    }
    const patch = subscriptionPatchFromStripe(sub, existing.plan as PlanId);
    const updated = await tx
      .update(users)
      .set(patch)
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (updated.length > 0) {
      await logFunnelEvent(
        {
          event: "subscription_checkout_completed",
          userId,
          metadata: { plan: patch.plan, stripeEventId: event.id },
        },
        tx,
      );
    }
  }

  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = customerIdOf(sub);
    const rows = await tx
      .select({ id: users.id, plan: users.plan })
      .from(users)
      .where(
        and(
          eq(users.stripeCustomerId, customerId),
          or(eq(users.stripeSubscriptionId, sub.id), isNull(users.stripeSubscriptionId)),
        ),
      );
    const targets =
      rows.length > 0
        ? rows
        : await tx.select({ id: users.id, plan: users.plan }).from(users).where(eq(users.stripeCustomerId, customerId));
    for (const row of targets) {
      const patch = subscriptionPatchFromStripe(sub, row.plan as PlanId);
      await tx.update(users).set(patch).where(eq(users.id, row.id));
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = customerIdOf(sub);
    const narrowed = await tx
      .update(users)
      .set({
        subscriptionStatus: "inactive",
        plan: "starter",
        stripeSubscriptionId: null,
        stripePriceId: null,
      })
      .where(and(eq(users.stripeCustomerId, customerId), eq(users.stripeSubscriptionId, sub.id)))
      .returning({ id: users.id });
    if (narrowed.length === 0) {
      await tx
        .update(users)
        .set({
          subscriptionStatus: "inactive",
          plan: "starter",
          stripeSubscriptionId: null,
          stripePriceId: null,
        })
        .where(eq(users.stripeCustomerId, customerId));
    }
  }
}
