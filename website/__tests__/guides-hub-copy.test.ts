import { describe, expect, beforeAll, it } from "vitest";
import { productCopy } from "@/content/productCopy";
import {
  ensureMarketingSiteRunning,
  getSiteHtml,
  registerMarketingSiteTeardown,
} from "./helpers/siteTestServer";

registerMarketingSiteTeardown();

describe("guides hub copy", { timeout: 180_000 }, () => {
  beforeAll(async () => {
    await ensureMarketingSiteRunning();
  });

  it("includes supporting sentence from productCopy", async () => {
    const html = await getSiteHtml("/guides");
    expect(html.replace(/\s+/g, " ")).toContain(
      productCopy.guidesHubSupportingSentence.replace(/\s+/g, " "),
    );
  });
});
