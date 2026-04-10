import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { insert, values } = vi.hoisted(() => {
  const v = vi.fn();
  const ins = vi.fn(() => ({ values: v }));
  return { insert: ins, values: v };
});

vi.mock("@/db/client", () => ({
  db: { insert },
}));

import { logFunnelEvent } from "@/lib/funnelEvent";

describe("logFunnelEvent", () => {
  beforeEach(() => {
    insert.mockClear();
    values.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts on success", async () => {
    values.mockResolvedValue(undefined);
    await logFunnelEvent({ event: "demo_verify_ok" });
    expect(insert).toHaveBeenCalled();
    expect(values).toHaveBeenCalled();
  });

  it("does not throw and logs funnel_event_drop on failure", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    values.mockRejectedValue(new Error("db down"));
    await logFunnelEvent({ event: "demo_verify_ok" });
    expect(errSpy).toHaveBeenCalled();
    const payload = errSpy.mock.calls[0]?.[0] as string;
    expect(payload).toContain("funnel_event_drop");
    errSpy.mockRestore();
  });
});
