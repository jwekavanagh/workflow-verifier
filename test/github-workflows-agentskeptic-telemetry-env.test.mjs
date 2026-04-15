/**
 * Authoritative inventory: every workflow job in .github/workflows and AGENTSKEPTIC_TELEMETRY env rules.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadWorkflow(name) {
  const text = readFileSync(join(root, ".github", "workflows", name), "utf8");
  return parse(text);
}

describe("GitHub Actions AGENTSKEPTIC_TELEMETRY env", () => {
  it("ci.yml jobs match inventory", () => {
    const doc = loadWorkflow("ci.yml");
    const jobs = doc.jobs;
    const ids = Object.keys(jobs).sort();
    assert.deepEqual(ids, ["codeql", "commercial", "distribution-consumer", "test"]);
    assert.equal(jobs.test.env.AGENTSKEPTIC_TELEMETRY, "0");
    assert.equal(jobs.commercial.env.AGENTSKEPTIC_TELEMETRY, "0");
    assert.equal(jobs["distribution-consumer"].env.AGENTSKEPTIC_TELEMETRY, "0");
    assert.equal("AGENTSKEPTIC_TELEMETRY" in (jobs.codeql.env ?? {}), false);
  });

  it("commercial-publish.yml publish job has telemetry env", () => {
    const doc = loadWorkflow("commercial-publish.yml");
    assert.equal(doc.jobs.publish.env.AGENTSKEPTIC_TELEMETRY, "0");
  });

  it("assurance-scheduled.yml assurance job has telemetry env", () => {
    const doc = loadWorkflow("assurance-scheduled.yml");
    assert.equal(doc.jobs.assurance.env.AGENTSKEPTIC_TELEMETRY, "0");
  });
});
