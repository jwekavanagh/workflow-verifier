import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { logFunnelEvent } from "@/lib/funnelEvent";
import { generateApiKeyPlaintext, hashApiKey, sha256Hex } from "@/lib/apiKeyCrypto";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, session.user.id), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "An API key already exists. Revoke it before creating a new one." },
      { status: 400 },
    );
  }

  const plain = generateApiKeyPlaintext();
  const keyHash = hashApiKey(plain);
  const keyLookupSha256 = sha256Hex(plain);

  await db.insert(apiKeys).values({
    userId: session.user.id,
    keyHash,
    keyLookupSha256,
  });

  await logFunnelEvent({ event: "api_key_created", userId: session.user.id });

  return NextResponse.json({ apiKey: plain });
}
