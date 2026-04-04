import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "debug-ui");
const dest = join(root, "dist", "debug-ui");

if (!existsSync(src)) {
  console.error("copy-debug-ui: missing debug-ui/", src);
  process.exit(1);
}
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
