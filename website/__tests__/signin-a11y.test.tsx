/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SignInPage from "@/app/auth/signin/page";
import { productCopy } from "@/content/productCopy";

const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
}));

afterEach(() => {
  cleanup();
  signInMock.mockReset();
});

describe("sign-in a11y", () => {
  beforeEach(() => {
    signInMock.mockResolvedValue({ error: null, status: 200, ok: true, url: "http://x" });
  });

  it("uses assertive live region on signIn error", async () => {
    signInMock.mockResolvedValue({
      error: "CredentialsSignin",
      code: "credentials",
      status: 401,
      ok: false,
      url: null,
    });
    render(
      <Suspense fallback={null}>
        <SignInPage />
      </Suspense>,
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(productCopy.signInA11y.sendEmailError);
    });
  });

  it("shows Resend testing-mode guidance when signIn returns resend_testing_recipients", async () => {
    signInMock.mockResolvedValue({
      error: "CredentialsSignin",
      code: "resend_testing_recipients",
      status: 200,
      ok: true,
      url: "http://x/api/auth/signin?error=CredentialsSignin&code=resend_testing_recipients",
    });
    render(
      <Suspense fallback={null}>
        <SignInPage />
      </Suspense>,
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        productCopy.signInA11y.sendEmailResendTestingRecipients,
      );
    });
  });

  it("uses polite live region on success", async () => {
    render(
      <Suspense fallback={null}>
        <SignInPage />
      </Suspense>,
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));
    await waitFor(() => {
      const polite = document.querySelector("[aria-live=polite]");
      expect(polite?.textContent).toContain(productCopy.signInA11y.magicLinkSent);
    });
  });
});
