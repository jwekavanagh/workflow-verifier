/**
 * Per-file absence of superseded integrate success API and spine batch-only terminal.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const O1 =
  'node dist/cli.js verify-integrator-owned --workflow-id wf_integrate_spine --events "$OUT2/events.ndjson" --registry "$OUT2/tools.json" --db "$AGENTSKEPTIC_VERIFY_DB"';

const matrix = [
  {
    file: join(root, "website", "src", "content", "productCopy.ts"),
    forbidden: ["successHeading", "successIntro", "successBullets", "What success looks like"],
  },
  {
    file: join(root, "website", "src", "app", "integrate", "page.tsx"),
    forbidden: ["successHeading", "successIntro", "successBullets"],
  },
  {
    file: join(root, "website", "src", "components", "IntegrateActivationBlock.tsx"),
    forbidden: ["successHeading"],
  },
  {
    file: join(root, "website", "src", "content", "siteMetadata.ts"),
    forbidden: ["What success looks like"],
  },
  {
    file: join(root, "website", "src", "generated", "epistemicContractIntegrator.ts"),
    forbidden: ["What success looks like"],
  },
  {
    file: join(root, "website", "src", "components", "FunnelSurfaceBeacon.tsx"),
    forbidden: ["successHeading", "What success looks like"],
  },
];

function assertNoBatchOnlySpineLine(content, label) {
  assert.ok(content.includes(O1), `${label} must contain O1 verify-integrator-owned spine terminal line`);
  for (const line of content.split(/\r?\n/)) {
    if (!line.includes("wf_integrate_spine") || !line.includes("node dist/cli.js")) continue;
    assert.ok(
      line.includes("verify-integrator-owned"),
      `${label}: wf_integrate_spine line must use verify-integrator-owned: ${line}`,
    );
  }
}

describe("integrate route copy absence matrix", () => {
  for (const { file, forbidden } of matrix) {
    it(`forbidden_substrings_absent:${file.replace(/\\/g, "/")}`, () => {
      const utf8 = readFileSync(file, "utf8");
      for (const sub of forbidden) {
        assert.equal(
          utf8.includes(sub),
          false,
          `${file} must not contain forbidden substring ${JSON.stringify(sub)}`,
        );
      }
    });
  }

  it("integrate_activation_shell_template_has_O1_and_no_batch_only_spine", () => {
    const p = join(root, "scripts", "templates", "integrate-activation-shell.bash");
    assertNoBatchOnlySpineLine(readFileSync(p, "utf8"), "integrate-activation-shell.bash");
  });

  it("integrate_activation_shell_generated_ts_has_O1_and_no_batch_only_spine", () => {
    const p = join(root, "website", "src", "generated", "integrateActivationShellStatic.ts");
    assertNoBatchOnlySpineLine(readFileSync(p, "utf8"), "integrateActivationShellStatic.ts");
  });
});
