import { integrateActivation } from "@/content/productCopy";
import { describe, expect, it } from "vitest";

describe("integrate next-steps surface (PR-O4)", () => {
  it("exactly one next step and no registry-draft peer CTA", () => {
    expect(integrateActivation.nextSteps.length).toBe(1);
    expect(JSON.stringify(integrateActivation.nextSteps).toLowerCase()).not.toContain("registry-draft");
    expect(integrateActivation.nextSteps[0].href).toContain("first-run-integration.md");
    expect(integrateActivation.nextSteps[0].href).toMatch(
      /^https:\/\/github\.com\/jwekavanagh\/agentskeptic\/blob\/main\/docs\/first-run-integration\.md(#.+)?$/,
    );
  });
});
