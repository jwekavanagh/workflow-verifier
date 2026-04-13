import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { returning, values, insert } = vi.hoisted(() => {
  const returningInner = vi.fn();
  const valuesInner = vi.fn(() => ({ returning: returningInner }));
  const insertInner = vi.fn(() => ({ values: valuesInner }));
  return { returning: returningInner, values: valuesInner, insert: insertInner };
});

vi.mock("@/db/client", () => ({
  db: { insert },
}));

vi.mock("@/lib/funnelEvent", () => ({
  logFunnelEvent: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/public/verification-reports/route";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getRepoRoot } from "./helpers/distributionGraphHelpers";

describe("POST /api/public/verification-reports", () => {
  const prev = process.env.PUBLIC_VERIFICATION_REPORTS_ENABLED;
  const prevUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.PUBLIC_VERIFICATION_REPORTS_ENABLED = "1";
    process.env.NEXT_PUBLIC_APP_URL = "https://agentskeptic.com";
    insert.mockClear();
    values.mockClear();
    returning.mockReset();
    returning.mockResolvedValue([{ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }]);
  });

  afterEach(() => {
    process.env.PUBLIC_VERIFICATION_REPORTS_ENABLED = prev;
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevUrl;
    vi.clearAllMocks();
  });

  it("returns 503 when feature disabled", async () => {
    process.env.PUBLIC_VERIFICATION_REPORTS_ENABLED = "0";
    const req = new NextRequest("http://localhost/api/public/verification-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns 201 with schemaVersion, id, url on valid workflow envelope", async () => {
    const root = getRepoRoot();
    const raw = readFileSync(
      join(root, "website", "src", "content", "embeddedReports", "langgraph-guide.v1.json"),
      "utf8",
    );
    const req = new NextRequest("http://agentskeptic.com/api/public/verification-reports", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-host": "evil.test",
      },
      body: raw,
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { schemaVersion: number; id: string; url: string };
    expect(json.schemaVersion).toBe(1);
    expect(json.id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(json.url).toBe("https://agentskeptic.com/r/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(insert).toHaveBeenCalled();
  });

  it("returns 413 when body exceeds 393216 bytes", async () => {
    const big = "x".repeat(393217);
    const req = new NextRequest("http://localhost/api/public/verification-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pad: big }),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(insert).not.toHaveBeenCalled();
  });
});
