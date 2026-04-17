import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { integrateActivation, integrateRegistryDraft } from "@/content/productCopy";

describe("/integrate activation wiring", () => {
  it("page wires integrateActivation plus IntegrateActivationBlock (no inline command key)", () => {
    const pageSrc = readFileSync(
      path.join(__dirname, "..", "src", "app", "integrate", "page.tsx"),
      "utf8",
    );
    expect(pageSrc).toContain("integrateActivation");
    expect(pageSrc).toContain("IntegrateActivationBlock");
    expect(pageSrc).not.toContain("FirstRunActivationGuide");
    expect(pageSrc).not.toContain("embeddedFirstRunIntegrationMd");
    expect(pageSrc).not.toContain("langgraphReferenceReadmeUrl");
    expect(pageSrc).not.toContain("integratorDocsEmbedded");
    expect(pageSrc).not.toContain("a.command");
    expect(pageSrc.match(/<pre/g)?.length ?? 0).toBe(0);
    expect(pageSrc.toLowerCase()).not.toContain("repository root");
    expect(pageSrc).not.toContain("PARTNER_");
  });

  it("integrateActivation copy has no banned integrator tokens (partner_ / repository root)", () => {
    const blob = JSON.stringify(integrateActivation).toLowerCase();
    expect(blob).not.toContain("repository root");
    expect(blob).not.toContain("partner_");
  });

  it("integrateRegistryDraft copy has no banned integrator terms", () => {
    const blob = JSON.stringify(integrateRegistryDraft).toLowerCase();
    expect(blob).not.toContain("partner");
    expect(blob).not.toContain("repository root");
    expect(blob).not.toContain("partner_");
  });
});
