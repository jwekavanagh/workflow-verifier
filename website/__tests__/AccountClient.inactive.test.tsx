/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountClient } from "@/app/account/AccountClient";
import type { CommercialAccountStatePayload } from "@/lib/commercialAccountState";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: function MockLink({
    children,
    href,
  }: {
    children: ReactNode;
    href: string;
  }) {
    return <a href={href}>{children}</a>;
  },
}));

afterEach(() => {
  cleanup();
});

function baseCommercial(overrides: Partial<CommercialAccountStatePayload> = {}): CommercialAccountStatePayload {
  return {
    plan: "individual",
    subscriptionStatus: "inactive",
    priceMapping: "mapped",
    entitlementSummary: "Licensed verification (npm) needs an active subscription.",
    checkoutActivationReady: false,
    hasStripeCustomer: false,
    billingPriceSyncHint: null,
    ...overrides,
  };
}

describe("AccountClient inactive subscription", () => {
  it("shows recovery notice and pricing link", () => {
    render(<AccountClient hasKey={false} initialCommercial={baseCommercial()} />);

    const notice = screen.getByTestId("inactive-subscription-notice");
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveTextContent(/not active/i);
    expect(notice).toHaveTextContent(/licensed verification and enforcement are paused/i);
    expect(notice).toHaveTextContent(/subscribe from pricing to restore access/i);

    const pricing = screen.getByRole("link", { name: /view pricing and subscribe/i });
    expect(pricing).toHaveAttribute("href", "/pricing");
  });

  it("does not render Manage billing when hasStripeCustomer is false", () => {
    render(<AccountClient hasKey={false} initialCommercial={baseCommercial({ hasStripeCustomer: false })} />);
    expect(screen.queryByTestId("manage-billing-button")).not.toBeInTheDocument();
  });

  it("renders exactly one Manage billing button when hasStripeCustomer is true", () => {
    render(<AccountClient hasKey={false} initialCommercial={baseCommercial({ hasStripeCustomer: true })} />);
    const buttons = screen.getAllByRole("button", { name: /^manage billing$/i });
    expect(buttons).toHaveLength(1);
  });

  it("inactive notice references Manage billing when hasStripeCustomer is true", () => {
    render(
      <AccountClient
        hasKey={false}
        initialCommercial={baseCommercial({ hasStripeCustomer: true })}
      />,
    );
    const notice = screen.getByTestId("inactive-subscription-notice");
    expect(notice).toHaveTextContent(/use manage billing above/i);
  });

  it("documents licensed CLI prerequisites next to API key", () => {
    render(<AccountClient hasKey={false} initialCommercial={baseCommercial()} />);
    expect(screen.getByText(/AGENTSKEPTIC_API_KEY/i)).toBeInTheDocument();
    expect(screen.getByText(/npx agentskeptic verify/i)).toBeInTheDocument();
  });

  it("does not show inactive notice when subscription is active", () => {
    render(
      <AccountClient
        hasKey={false}
        initialCommercial={baseCommercial({ subscriptionStatus: "active" })}
      />,
    );
    expect(screen.queryByTestId("inactive-subscription-notice")).not.toBeInTheDocument();
  });

  it("shows billing price sync hint when price is unmapped", () => {
    render(
      <AccountClient
        hasKey={false}
        initialCommercial={baseCommercial({
          subscriptionStatus: "active",
          priceMapping: "unmapped",
          billingPriceSyncHint: {
            supportEmail: "billing-support@example.com",
          },
        })}
      />,
    );
    const hint = screen.getByTestId("billing-price-sync-hint");
    expect(hint).toHaveTextContent("Billing setup is still finishing");
    const link = hint.querySelector("a[href='mailto:billing-support@example.com']");
    expect(link).toBeTruthy();
    expect(link?.textContent).toBe("billing-support@example.com");
  });

  it("shows footer fallback when unmapped and no support email", () => {
    render(
      <AccountClient
        hasKey={false}
        initialCommercial={baseCommercial({
          subscriptionStatus: "active",
          priceMapping: "unmapped",
          billingPriceSyncHint: { supportEmail: null },
        })}
      />,
    );
    expect(screen.getByTestId("billing-price-sync-hint")).toHaveTextContent("site footer");
  });
});
