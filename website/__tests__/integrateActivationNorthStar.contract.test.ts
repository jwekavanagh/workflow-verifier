import { DECISION_READY_PRODUCTION_COMPLETE_ADOPTION_BLOB_URL } from "@/lib/githubHeadingSlug";
import { integrateActivation } from "@/content/productCopy";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

describe("integrateActivation north star (decision-ready ProductionComplete)", () => {
  it("URL field strictly equals module constant", () => {
    expect(integrateActivation.decisionReadyProductionCompleteAdoptionBlobUrl).toBe(
      DECISION_READY_PRODUCTION_COMPLETE_ADOPTION_BLOB_URL,
    );
  });

  it("milestone phrase present and forbidden conflation absent", () => {
    expect(integrateActivation.proved.includes("IntegrateSpineComplete when exit code is 0")).toBe(true);
    expect(JSON.stringify(integrateActivation)).not.toContain(
      "IntegrateSpineComplete alone satisfies Decision-ready ProductionComplete",
    );
    expect(JSON.stringify(integrateActivation)).toContain("Decision-ready ProductionComplete");
    const blob = JSON.stringify(integrateActivation);
    expect(blob).not.toContain("What success looks like");
    expect(blob).not.toContain("successHeading");
    expect(blob).not.toContain("successIntro");
    expect(blob).not.toContain("successBullets");
    expect(integrateActivation.spineCheckpointHeading).toBe("Mechanical spine checkpoint (not product completion)");
    expect(integrateActivation.productCompletionHeading).toBe("Product completion: Step 4 on your emitters");
  });

  it("adoption SSOT heading uniqueness and item 5 fixture parity", () => {
    const adoptionPath = join(repoRoot, "docs", "adoption-epistemics-ssot.md");
    const lines = readFileSync(adoptionPath, "utf8").split(/\r?\n/);
    const heading = "### Decision-ready ProductionComplete (normative)";
    const count = lines.filter((line) => line.trim() === heading).length;
    expect(count).toBe(1);
    const matches = lines.filter((line) => line.trim().startsWith("5. **Success criteria (normative):**"));
    expect(matches.length).toBe(1);
    const L = matches[0]!;
    const fixture = readFileSync(join(repoRoot, "test", "fixtures", "adoption-item5-normative-line.txt"), "utf8")
      .replace(/\r\n/g, "\n")
      .trimEnd();
    expect(L).toBe(fixture);
  });
});
