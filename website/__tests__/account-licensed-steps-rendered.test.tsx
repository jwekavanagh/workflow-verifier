/** @vitest-environment jsdom */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountLicensedStepsList } from "@/components/account/AccountLicensedStepsList";
import { productCopy } from "@/content/productCopy";

describe("AccountLicensedStepsList (rendered)", () => {
  it("renders ordered steps with required proof strings", () => {
    render(<AccountLicensedStepsList />);
    const list = screen.getByTestId("account-licensed-verify-steps");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(productCopy.accountLicensedVerifySteps.length);
    const joined = items.map((el) => el.textContent ?? "").join(" ");
    expect(joined).toContain("AGENTSKEPTIC_API_KEY");
    expect(joined).toContain("/openapi-commercial-v1.yaml");
    expect(joined).toContain("commercial-entitlement-matrix.md");
  });
});
