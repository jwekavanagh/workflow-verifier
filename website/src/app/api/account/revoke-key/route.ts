import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const updated = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.userId, session.user.id), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });

  return NextResponse.json({
    ok: true as const,
    revoked: updated.length >= 1,
  });
}
