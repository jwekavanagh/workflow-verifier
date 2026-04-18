import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = path.resolve(__dirname, "..", "..");

describe("funnel observability epistemics SSOT", () => {
  it("docs/funnel-observability-ssot.md retains user vs telemetry capture taxonomy", () => {
    const p = path.join(root, "docs", "funnel-observability-ssot.md");
    const body = readFileSync(p, "utf8");

    expect(body).toContain("## User outcome vs telemetry capture (operator)");
    expect(body).toContain("User-side");
    expect(body).toContain("Telemetry capture-side");

    expect(body).toMatch(/growth-metrics-ssot\.md/);
    expect(body).toMatch(/join key|join on/i);

    expect(body).toContain("best-effort");
    expect(body).toContain("not authoritative");
  });
});
