import { existsSync } from "node:fs";
import path from "node:path";

const DOC_NAME = "first-run-integration.md";

/**
 * Resolve `docs/first-run-integration.md` whether cwd is `website/` or monorepo root.
 * @returns Absolute path if file exists, else null.
 */
export function resolveFirstRunIntegrationMd(): string | null {
  const candidates = [
    path.join(process.cwd(), "docs", DOC_NAME),
    path.join(process.cwd(), "..", "docs", DOC_NAME),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}
