/**
 * Runs website Vitest with WEBSITE_TEST_REUSE_DIST=1 so marketing HTML tests reuse
 * the `.next` output from a preceding `npm run build -w agentskeptic-web` (CI memory / flake guard).
 */
import { spawnSync } from "node:child_process";

process.env.WEBSITE_TEST_REUSE_DIST = "1";
const r = spawnSync("npm", ["run", "test:vitest", "-w", "agentskeptic-web"], {
  stdio: "inherit",
  shell: true,
});
process.exit(r.status === null ? 1 : r.status);
