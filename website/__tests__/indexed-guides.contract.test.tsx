/** @vitest-environment jsdom */

import TraceGreenPage from "@/app/guides/trace-green-postgres-row-missing/page";
import ToolLoopPage from "@/app/guides/tool-loop-success-crm-state-wrong/page";
import CiGreenPage from "@/app/guides/ci-green-logs-row-absent/page";
import PreProdPage from "@/app/guides/pre-production-read-only-sql-gate/page";
import LangGraphPage from "@/app/guides/verify-langgraph-workflows/page";
import AiAgentWrongCrmPage from "@/app/guides/ai-agent-wrong-crm-data/page";
import AutomationMismatchPage from "@/app/guides/automation-success-database-mismatch/page";
import DebugPostgresLangGraphPage from "@/app/guides/debug-postgres-after-langgraph/page";
import StripeWebhookPage from "@/app/guides/stripe-webhook-database-alignment/page";
import CiGreenMissingPage from "@/app/guides/ci-green-missing-database-side-effect/page";
import GuidesHubPage from "@/app/guides/page";
import * as traceMeta from "@/app/guides/trace-green-postgres-row-missing/page";
import * as toolMeta from "@/app/guides/tool-loop-success-crm-state-wrong/page";
import * as ciMeta from "@/app/guides/ci-green-logs-row-absent/page";
import * as preMeta from "@/app/guides/pre-production-read-only-sql-gate/page";
import * as lgMeta from "@/app/guides/verify-langgraph-workflows/page";
import * as aiMeta from "@/app/guides/ai-agent-wrong-crm-data/page";
import * as autoMeta from "@/app/guides/automation-success-database-mismatch/page";
import * as dbgMeta from "@/app/guides/debug-postgres-after-langgraph/page";
import * as stripeMeta from "@/app/guides/stripe-webhook-database-alignment/page";
import * as ciMissMeta from "@/app/guides/ci-green-missing-database-side-effect/page";
import * as hubMeta from "@/app/guides/page";
import discoveryAcquisition from "@/lib/discoveryAcquisition";
import { indexableGuideCanonical } from "@/lib/indexableGuides";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  },
}));

afterEach(() => {
  cleanup();
});

function assertGuideContract(Page: () => ReactElement, path: string) {
  const g = discoveryAcquisition.indexableGuides.find((x) => x.path === path)!;
  const { container } = render(<Page />);
  const shell = container.querySelector('[data-testid="indexed-guide-shell"]');
  expect(shell).toBeTruthy();
  const text = (shell as HTMLElement).textContent ?? "";
  expect(text).toContain(g.problemAnchor);
  expect(text).toContain("ROW_ABSENT");
  const integrate = (shell as HTMLElement).querySelectorAll('a[href="/integrate"]');
  expect(integrate.length).toBe(1);
}

describe("indexed guides", () => {
  it("hub is noindex and lists exactly indexableGuides links", () => {
    expect(hubMeta.metadata.robots).toEqual({ index: false, follow: true });
    const { container } = render(<GuidesHubPage />);
    const links = container.querySelectorAll("a[href]");
    expect(links.length).toBe(discoveryAcquisition.indexableGuides.length);
    for (const g of discoveryAcquisition.indexableGuides) {
      expect(container.querySelector(`a[href="${g.path}"]`)).toBeTruthy();
    }
  });

  it("each indexable guide meets shell contract", () => {
    assertGuideContract(LangGraphPage, "/guides/verify-langgraph-workflows");
    assertGuideContract(TraceGreenPage, "/guides/trace-green-postgres-row-missing");
    assertGuideContract(ToolLoopPage, "/guides/tool-loop-success-crm-state-wrong");
    assertGuideContract(CiGreenPage, "/guides/ci-green-logs-row-absent");
    assertGuideContract(PreProdPage, "/guides/pre-production-read-only-sql-gate");
    assertGuideContract(AiAgentWrongCrmPage, "/guides/ai-agent-wrong-crm-data");
    assertGuideContract(AutomationMismatchPage, "/guides/automation-success-database-mismatch");
    assertGuideContract(DebugPostgresLangGraphPage, "/guides/debug-postgres-after-langgraph");
    assertGuideContract(StripeWebhookPage, "/guides/stripe-webhook-database-alignment");
    assertGuideContract(CiGreenMissingPage, "/guides/ci-green-missing-database-side-effect");
  });

  it("metadata titles and descriptions are unique and canonical matches origin+path", () => {
    const metas = [
      lgMeta.metadata,
      traceMeta.metadata,
      toolMeta.metadata,
      ciMeta.metadata,
      preMeta.metadata,
      aiMeta.metadata,
      autoMeta.metadata,
      dbgMeta.metadata,
      stripeMeta.metadata,
      ciMissMeta.metadata,
    ];
    const keys = metas.map((m) => `${String(m.title)}|${String(m.description)}`);
    expect(new Set(keys).size).toBe(keys.length);
    const paths = discoveryAcquisition.indexableGuides.map((g) => g.path);
    for (let i = 0; i < paths.length; i++) {
      expect(metas[i].robots).toEqual({ index: true, follow: true });
      expect(metas[i].alternates?.canonical).toBe(indexableGuideCanonical(paths[i]));
    }
  });
});
