#!/usr/bin/env node
/**
 * Fail-closed activation spine proof (activation_spine_prd).
 * Preflight: DATABASE_URL, TELEMETRY_DATABASE_URL, dist/cli.js, dist/telemetry/postProductActivationEvent.js.
 * Sets ACTIVATION_SPINE_VALIDATOR=1 for all children so DB suites cannot skip silently.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function fail(msg) {
  console.error(`validate-activation-spine: ${msg}`);
  process.exit(1);
}

for (const v of ["DATABASE_URL", "TELEMETRY_DATABASE_URL"]) {
  if (!process.env[v]?.trim()) {
    fail(`missing or empty ${v}`);
  }
}

for (const rel of ["dist/cli.js", "dist/telemetry/postProductActivationEvent.js"]) {
  const p = path.join(root, rel);
  if (!existsSync(p)) {
    fail(`missing file ${rel} (run npm run build at repo root)`);
  }
}

const childEnv = { ...process.env, ACTIVATION_SPINE_VALIDATOR: "1" };

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    env: childEnv,
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

run("npm", ["run", "check:integrate-activation-shell"]);
run("npm", [
  "run",
  "test:vitest",
  "-w",
  "agentskeptic-web",
  "--",
  "__tests__/activation-spine-narrative-alignment.source.test.ts",
]);
run("npx", ["vitest", "run", "src/commercial/verifyWorkloadClassify.test.ts"]);
run("npm", [
  "run",
  "test:vitest",
  "-w",
  "agentskeptic-web",
  "--",
  "__tests__/integrate-activation-guided-spine.integration.test.tsx",
]);
run("npm", [
  "run",
  "test:vitest",
  "-w",
  "agentskeptic-web",
  "--",
  "__tests__/integrate-activation-telemetry-off.integration.test.ts",
]);
run(process.execPath, ["--test", "test/integrate-spine-step3-chain.happy.test.mjs"]);
run(process.execPath, ["--test", "test/integrate-spine-step3-chain.negative.test.mjs"]);
run("npm", [
  "run",
  "test:vitest",
  "-w",
  "agentskeptic-web",
  "--",
  "__tests__/product-activation-reachability.integration.test.ts",
]);
run("npm", [
  "run",
  "test:vitest",
  "-w",
  "agentskeptic-web",
  "--",
  "__tests__/integrate-next-steps-surface.source.test.ts",
]);
run("npm", [
  "run",
  "test:vitest",
  "-w",
  "agentskeptic-web",
  "--",
  "__tests__/funnel-observability-epistemics.source.test.ts",
]);
