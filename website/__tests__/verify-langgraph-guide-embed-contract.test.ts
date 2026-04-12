import { describe, expect, beforeAll, it } from "vitest";
import {
  ensureMarketingSiteRunning,
  getSiteHtml,
  registerMarketingSiteTeardown,
} from "./helpers/siteTestServer";

export const GUIDE_CONTRACT_PATH = "/guides/verify-langgraph-workflows";

registerMarketingSiteTeardown();

describe("indexed guide embed contract (R9)", { timeout: 180_000 }, () => {
  beforeAll(async () => {
    await ensureMarketingSiteRunning();
  });

  it("single h1; embed uses h2 title class", async () => {
    const html = await getSiteHtml(GUIDE_CONTRACT_PATH);
    const h1Count = (html.match(/<h1\b/gi) ?? []).length;
    expect(h1Count).toBe(1);
    expect(html).toContain('data-testid="verification-report-embed"');
    expect(html).toContain('class="verification-report-embed-title"');
  });
});
