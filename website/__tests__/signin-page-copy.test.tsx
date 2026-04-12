/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SignInPage from "@/app/auth/signin/page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
});

describe("sign-in page copy", () => {
  it("lists Individual and Team in benefits", async () => {
    render(
      <Suspense fallback={null}>
        <SignInPage />
      </Suspense>,
    );
    const list = await screen.findByRole("list");
    expect(within(list).getByText(/Individual/i)).toBeTruthy();
    expect(within(list).getByText(/Team/i)).toBeTruthy();
  });
});
