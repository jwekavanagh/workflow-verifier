import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const PREFIX = "wf_sk_live_";
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

/**
 * Deterministic SHA-256 hex digest for **database lookup only** (`keyLookupSha256`).
 * Input must be high-entropy bearer material from this module (`randomHexWithWfSkLivePrefix`) or the
 * same format from an `Authorization: Bearer` header. **Authorization** is `verifyApiKey` against
 * `hashApiKey` (scrypt). Do not use for human passwords or as the sole stored verifier.
 */
export function sha256HexApiKeyLookupFingerprint(s: string): string {
  // codeql[js/insufficient-password-hash] Deterministic lookup index for high-entropy bearer strings; possession is verified with scrypt in verifyApiKey.
  return createHash("sha256").update(s, "utf8").digest("hex"); // lgtm[js/insufficient-password-hash]
}

/** Format: scrypt$<salt_b64>$<hash_b64> */
export function hashApiKey(plaintext: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plaintext, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyApiKey(plaintext: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "base64url");
  const expected = Buffer.from(parts[2]!, "base64url");
  const hash = scryptSync(plaintext, salt, expected.length, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(hash, expected);
}

/** `wf_sk_live_` + 64 hex chars (256-bit CSPRNG). Name avoids password heuristics; this is not a user-chosen password. */
export function randomHexWithWfSkLivePrefix(): string {
  return PREFIX + randomBytes(32).toString("hex");
}

export function maskApiKey(k: string): string {
  if (k.length <= 12) return "****";
  return `${k.slice(0, 8)}…${k.slice(-4)}`;
}
