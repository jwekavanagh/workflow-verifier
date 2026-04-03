import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const REQUIRED = [
  "### Low-friction integration (in-process)",
  "### Batch and CLI (replay)",
  "### Human truth report",
  "### Engineer note: shared step core",
  "### Operator",
  "await withWorkflowVerification",
  "observeStep",
  "Workflow verification observeStep invoked after workflow run completed",
  "MALFORMED_EVENT_LINE",
  "DUPLICATE_SEQ",
  "strings and primitives are not parsed as NDJSON",
  "example:workflow-hook",
  "One root boundary; library owns DB close in finally; avoids silent leaks when integrators omit a terminal call.",
  "Same event contract for CI and external logs without requiring in-process wrapper.",
  "One reconciliation path; batch and in-process cannot drift.",
  "redact params in retained logs",
  "truthReport",
  "formatWorkflowTruthReport",
  "STEP_STATUS_TRUTH_LABELS",
  "workflow_id:",
  "workflow_status:",
  "run_level:",
  "steps:",
  "status=",
  "TRUSTED: Every step matched the database under the configured verification rules.",
  "NOT_TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.",
  "NOT_TRUSTED: At least one step failed verification against the database (determinate failure).",
  "Event line was missing, invalid JSON, or failed schema validation for a tool observation.",
  "Duplicate seq values appeared for this workflow; ordering may be unreliable.",
  "Unknown run-level code (forward compatibility).",
  "For the CLI, a **human-readable verification report** is written to **stderr**",
  "docs/execution-truth-layer.md#human-truth-report",
  "Reading logs:",
];

describe("docs contract (SSOT + README)", () => {
  it("contains all pinned substrings", () => {
    const ssot = readFileSync(join(root, "docs", "execution-truth-layer.md"), "utf8");
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const bundle = `${ssot}\n${readme}`;
    for (const s of REQUIRED) {
      assert.ok(bundle.includes(s), `missing substring: ${s.slice(0, 60)}…`);
    }
  });
});
