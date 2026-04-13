import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import {
  STRIPE_CUSTOMER_MISSING_ERROR,
  STRIPE_CUSTOMER_MISSING_MESSAGE,
} from "@/lib/billingPortalConstants";
import { getCanonicalSiteOrigin } from "@/lib/canonicalSiteOrigin";
import { isStripeMissingCustomerError } from "@/lib/stripeMissingCustomerError";
import { getStripe } from "@/lib/stripeServer";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const customerId = row?.stripeCustomerId?.trim();
  if (!customerId) {
    return NextResponse.json(
      { error: STRIPE_CUSTOMER_MISSING_ERROR, message: STRIPE_CUSTOMER_MISSING_MESSAGE },
      { status: 404 },
    );
  }

  const base = getCanonicalSiteOrigin().replace(/\/$/, "");
  const return_url = `${base}/account`;

  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url,
    });
    if (!portal.url) {
      console.error(JSON.stringify({ kind: "billing_portal_session_failed", reason: "missing_url" }));
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
    return NextResponse.json({ url: portal.url });
  } catch (e) {
    if (isStripeMissingCustomerError(e)) {
      await db.update(users).set({ stripeCustomerId: null }).where(eq(users.id, session.user.id));
      console.error(
        JSON.stringify({
          kind: "billing_portal_stale_stripe_customer_cleared",
          customerId,
        }),
      );
      return NextResponse.json(
        { error: STRIPE_CUSTOMER_MISSING_ERROR, message: STRIPE_CUSTOMER_MISSING_MESSAGE },
        { status: 404 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ kind: "billing_portal_session_failed", message: msg }));
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
