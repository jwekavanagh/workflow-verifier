import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSchemaValidator } from "agentskeptic";
import { getRepoRoot } from "./helpers/distributionGraphHelpers";

describe("example-wf-complete.v1 embed", () => {
  it("validates public envelope and workflow result for wf_complete", () => {
    const root = getRepoRoot();
    const p = join(root, "website", "src", "content", "embeddedReports", "example-wf-complete.v1.json");
    const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    const vEnv = loadSchemaValidator("public-verification-report-v1");
    expect(vEnv(raw)).toBe(true);
    expect(raw.kind).toBe("workflow");
    const wr = raw.workflowResult as {
      status: string;
      workflowId: string;
      steps: { status: string }[];
    };
    expect(wr.workflowId).toBe("wf_complete");
    expect(wr.status).toBe("complete");
    expect(wr.steps[0]?.status).toBe("verified");
    expect(loadSchemaValidator("workflow-result")(raw.workflowResult)).toBe(true);
  });
});
