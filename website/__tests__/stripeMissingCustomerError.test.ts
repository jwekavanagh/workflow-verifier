import { describe, expect, it } from "vitest";
import { isStripeMissingCustomerError } from "@/lib/stripeMissingCustomerError";

describe("isStripeMissingCustomerError", () => {
  it("returns true for Stripe resource_missing code", () => {
    expect(isStripeMissingCustomerError({ code: "resource_missing", message: "x" })).toBe(true);
  });

  it("returns true when message matches No such customer (production shape)", () => {
    expect(
      isStripeMissingCustomerError({
        message: "No such customer: 'cus_UJWCoOQXH4w4k2'",
      }),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isStripeMissingCustomerError(new Error("Card declined"))).toBe(false);
    expect(isStripeMissingCustomerError(null)).toBe(false);
    expect(isStripeMissingCustomerError({ code: "card_declined" })).toBe(false);
  });
});
