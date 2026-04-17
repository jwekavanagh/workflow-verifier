import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { integrateActivation, integrateRegistryDraft } from "@/content/productCopy";

describe("/integrate activation wiring", () => {
  it("page wires integrateActivation plus metadata and exposes a single command block", () => {
    const pageSrc = readFileSync(
      path.join(__dirname, "..", "src", "app", "integrate", "page.tsx"),
      "utf8",
    );
    expect(pageSrc).toContain("integrateActivation");
    expect(pageSrc).not.toContain("FirstRunActivationGuide");
    expect(pageSrc).not.toContain("embeddedFirstRunIntegrationMd");
    expect(pageSrc).not.toContain("langgraphReferenceReadmeUrl");
    expect(pageSrc).not.toContain("integratorDocsEmbedded");
    const preOpens = pageSrc.match(/<pre/g);
    expect(preOpens?.length).toBe(1);
    expect(integrateActivation.command).toContain("npm run first-run-verify");
    expect(pageSrc.toLowerCase()).not.toContain("partner");
    expect(pageSrc.toLowerCase()).not.toContain("repository root");
    expect(pageSrc).not.toContain("PARTNER_");
  });

  it("integrateActivation copy has no banned integrator terms", () => {
    const blob = JSON.stringify(integrateActivation).toLowerCase();
    expect(blob).not.toContain("partner");
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
