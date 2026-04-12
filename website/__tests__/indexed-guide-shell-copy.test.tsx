/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IndexedGuideShell } from "@/components/guides/IndexedGuideShell";
import { productCopy } from "@/content/productCopy";

describe("IndexedGuideShell copy", () => {
  it("uses productCopy embed title and muted line", () => {
    render(
      <IndexedGuideShell>
        <p>Guide body</p>
      </IndexedGuideShell>,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: productCopy.indexedGuideEmbedTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(productCopy.indexedGuideEmbedMuted)).toBeInTheDocument();
  });
});
