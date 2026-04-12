/** @vitest-environment jsdom */

import ExamplesHubPage from "@/app/examples/page";
import WfCompletePage from "@/app/examples/wf-complete/page";
import WfMissingPage from "@/app/examples/wf-missing/page";
import * as hubMeta from "@/app/examples/page";
import * as completeMeta from "@/app/examples/wf-complete/page";
import * as missingMeta from "@/app/examples/wf-missing/page";
import discoveryAcquisition from "@/lib/discoveryAcquisition";
import { indexableExampleCanonical } from "@/lib/indexableGuides";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  },
}));

afterEach(() => {
  cleanup();
});

describe("indexed examples", () => {
  it("hub is noindex and lists exactly indexableExamples links", () => {
    expect(hubMeta.metadata.robots).toEqual({ index: false, follow: true });
    const { container } = render(<ExamplesHubPage />);
    const links = container.querySelectorAll("ul.mechanism-list a[href]");
    expect(links.length).toBe(discoveryAcquisition.indexableExamples.length);
    for (const e of discoveryAcquisition.indexableExamples) {
      expect(container.querySelector(`a[href="${e.path}"]`)).toBeTruthy();
    }
  });

  it("wf-complete page shows problem anchor and verification view", () => {
    const e = discoveryAcquisition.indexableExamples[0]!;
    expect(e.path).toBe("/examples/wf-complete");
    const { container } = render(<WfCompletePage />);
    expect(container.textContent).toContain(e.problemAnchor);
    expect(container.querySelector('[data-testid="verification-report-embed"]')).toBeTruthy();
  });

  it("wf-missing page shows problem anchor and ROW_ABSENT in view", () => {
    const e = discoveryAcquisition.indexableExamples[1]!;
    expect(e.path).toBe("/examples/wf-missing");
    const { container } = render(<WfMissingPage />);
    expect(container.textContent).toContain(e.problemAnchor);
    expect(container.textContent).toContain("ROW_ABSENT");
    expect(container.querySelector('[data-testid="verification-report-embed"]')).toBeTruthy();
  });

  it("metadata for example leaf pages is indexable with fixed titles", () => {
    expect(completeMeta.metadata.robots).toEqual({ index: true, follow: true });
    expect(missingMeta.metadata.robots).toEqual({ index: true, follow: true });
    expect(completeMeta.metadata.title).toBe("Example verified workflow wf_complete — AgentSkeptic");
    expect(missingMeta.metadata.title).toBe("Example inconsistent workflow wf_missing — AgentSkeptic");
    expect(completeMeta.metadata.alternates?.canonical).toBe(
      indexableExampleCanonical("/examples/wf-complete"),
    );
    expect(missingMeta.metadata.alternates?.canonical).toBe(
      indexableExampleCanonical("/examples/wf-missing"),
    );
  });
});
