// @vitest-environment jsdom

import IntegratePage from "@/app/integrate/page";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Expected accessible names for spine vs product sections — literals live only here (independent of productCopy exports). */
const EXPECT_SPINE_CHECKPOINT_H2 = "Mechanical spine checkpoint (not product completion)";
const EXPECT_PRODUCT_COMPLETION_H2 = "Product completion: Step 4 on your emitters";

const FORBIDDEN_IN_MAIN = [
  "What success looks like",
  "successHeading",
  "IntegrateSpineComplete alone satisfies Decision-ready ProductionComplete",
];

vi.mock("@/components/FunnelSurfaceBeacon", () => ({
  FunnelSurfaceBeacon: () => null,
}));

describe("/integrate completion semantics (RTL)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders spine and product h2 with frozen expected names; main text omits forbidden phrases", () => {
    const { container } = render(<IntegratePage />);
    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 2, name: EXPECT_SPINE_CHECKPOINT_H2 })).toBeTruthy();
    expect(within(main).getByRole("heading", { level: 2, name: EXPECT_PRODUCT_COMPLETION_H2 })).toBeTruthy();
    const aggregate = main.textContent ?? "";
    for (const bad of FORBIDDEN_IN_MAIN) {
      expect(aggregate.includes(bad)).toBe(false);
    }
    expect(container.querySelector('[data-testid="integrator-activation-commands"]')).toBeTruthy();
  });
});
