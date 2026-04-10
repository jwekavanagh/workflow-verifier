import { logFunnelEvent } from "@/lib/funnelEvent";

export async function recordSignInFunnel(userId: string): Promise<void> {
  await logFunnelEvent({ event: "sign_in", userId });
}
