import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "fs";
import { dirname } from "path";
import { randomBytes } from "crypto";

/**
 * Atomic write per quick-verify-normative.md: temp in same dir, fsync, rename, read-back verify.
 * @throws Error on any failure
 */
export function atomicWriteUtf8File(targetPath: string, utf8: string): void {
  const dir = dirname(targetPath);
  mkdirSync(dir, { recursive: true });
  const tmp = `${targetPath}.tmp.${randomBytes(8).toString("hex")}`;
  const buf = Buffer.from(utf8, "utf8");
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, buf, 0, buf.length);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, targetPath);
  const readBack = readFileSync(targetPath, "utf8");
  if (readBack !== utf8) {
    try {
      unlinkSync(targetPath);
    } catch {
      /* best effort */
    }
    throw new Error("Registry read-back mismatch after atomic write");
  }
}
