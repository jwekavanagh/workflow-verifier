/**
 * PatternComplete / checklist IDs must appear on integrator surfaces (plan parity).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const NEEDLES = [
  "PatternComplete",
  "AdoptionComplete_PatternComplete",
  "AC-TRUST-01",
  "AC-OPS-01",
  "IntegrateSpineComplete",
];

describe("adoption complete surface parity", () => {
  it("first_run_integration_doc_contains_needles", () => {
    const t = readFileSync(join(root, "docs", "first-run-integration.md"), "utf8");
    for (const n of NEEDLES) assert.ok(t.includes(n), `missing in first-run-integration.md: ${n}`);
  });

  it("integrate_activation_shell_template_contains_needles", () => {
    const t = readFileSync(join(root, "scripts", "templates", "integrate-activation-shell.bash"), "utf8");
    assert.ok(t.includes("PatternComplete"), "bash template must name PatternComplete");
    assert.ok(t.includes("IntegrateSpineComplete"), "bash template must name IntegrateSpineComplete");
    assert.ok(t.includes("ADOPT_DB"), "bash template must use ADOPT_DB temp copy");
    assert.ok(t.includes('"$ADOPT_DB"'), "bash template must verify against ADOPT_DB");
    assert.ok(t.includes("examples/integrate-your-db/bootstrap-input.json"), "bash template must run final spine input");
    assert.ok(t.includes("wf_integrate_spine"), "bash template must verify wf_integrate_spine");
    assert.ok(
      t.includes(
        'node dist/cli.js verify-integrator-owned --workflow-id wf_integrate_spine --events "$OUT2/events.ndjson" --registry "$OUT2/tools.json" --db "$AGENTSKEPTIC_VERIFY_DB"',
      ),
      "bash template must end spine with verify-integrator-owned O1 line",
    );
  });

  it("integrate_activation_shell_generated_matches_template_terminal_line", () => {
    const genPath = join(root, "website", "src", "generated", "integrateActivationShellStatic.ts");
    const g = readFileSync(genPath, "utf8");
    assert.ok(
      g.includes(
        'node dist/cli.js verify-integrator-owned --workflow-id wf_integrate_spine --events "$OUT2/events.ndjson" --registry "$OUT2/tools.json" --db "$AGENTSKEPTIC_VERIFY_DB"',
      ),
      "generated INTEGRATE_ACTIVATION_SHELL_BODY must include O1 terminal line",
    );
  });

  it("product_copy_integrate_activation_contains_needles", () => {
    const t = readFileSync(join(root, "website", "src", "content", "productCopy.ts"), "utf8");
    for (const n of NEEDLES) assert.ok(t.includes(n), `missing in productCopy.ts: ${n}`);
  });
});
