import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("/integrate page source", () => {
  it("does not embed generated integrator markdown in the page module", () => {
    const src = readFileSync(
      path.join(__dirname, "..", "src", "app", "integrate", "page.tsx"),
      "utf8",
    );
    expect(src).not.toContain("integratorDocsEmbedded");
  });
});
