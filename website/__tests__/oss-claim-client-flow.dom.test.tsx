/** @vitest-environment jsdom */

import { OssClaimClient } from "@/components/OssClaimClient";
import { productCopy } from "@/content/productCopy";
import { OSS_CLAIM_STORAGE_KEY } from "@/lib/ossClaimSessionStorageKey";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockUseSession } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: mockUseSession,
}));

vi.mock("next/link", () => ({
  default: function MockLink({
    children,
    href,
    ...rest
  }: { children: React.ReactNode; href: string } & Record<string, unknown>) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

const secretHex = "ab".repeat(32);

describe("OssClaimClient flow", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockUseSession.mockReset();
  });

  it("copies hash secret to sessionStorage, strips hash, POSTs redeem once, clears storage on 200", async () => {
    const replaceState = vi.fn();
    vi.stubGlobal("history", { ...window.history, replaceState });

    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: {
        hash: `#${secretHex}`,
        pathname: "/claim",
        search: "",
        href: `http://localhost/claim#${secretHex}`,
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          schema_version: 1,
          run_id: "run-dom-1",
          terminal_status: "complete",
          workload_class: "non_bundled",
          subcommand: "batch_verify",
          build_profile: "oss",
          claimed_at: new Date().toISOString(),
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    mockUseSession.mockReturnValue({
      status: "authenticated",
      data: { user: { id: "u-dom", email: "dom@example.com", name: null, image: null } },
      update: vi.fn(),
    });

    render(<OssClaimClient /> as ReactElement);

    await waitFor(() => {
      expect(sessionStorage.getItem(OSS_CLAIM_STORAGE_KEY)).toBe(secretHex);
    });

    expect(replaceState).toHaveBeenCalled();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/oss/claim-redeem");
    expect(JSON.parse(init.body as string)).toEqual({ claim_secret: secretHex });

    await waitFor(() => {
      expect(sessionStorage.getItem(OSS_CLAIM_STORAGE_KEY)).toBeNull();
    });
  });

  it("shows same-browser recovery when authenticated but storage is empty", async () => {
    vi.stubGlobal("history", { ...window.history, replaceState: vi.fn() });
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { hash: "", pathname: "/claim", search: "", href: "http://localhost/claim" },
    });
    sessionStorage.clear();

    mockUseSession.mockReturnValue({
      status: "authenticated",
      data: { user: { id: "u2", email: "x@y.com", name: null, image: null } },
      update: vi.fn(),
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<OssClaimClient /> as ReactElement);

    await waitFor(() => {
      expect(document.body.textContent).toContain(productCopy.ossClaimPage.sameBrowserRecovery.slice(0, 40));
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
