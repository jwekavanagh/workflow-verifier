import { createHash } from "node:crypto";

export function hashOssClaimSecret(claimSecret: string): string {
  return createHash("sha256").update(claimSecret, "utf8").digest("hex");
}
