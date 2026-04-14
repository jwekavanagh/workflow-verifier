import {
  emailSignInOptions,
  sanitizeInternalCallbackUrl,
} from "@/lib/sanitizeInternalCallbackUrl";
import { describe, expect, it } from "vitest";

describe("sanitizeInternalCallbackUrl", () => {
  it.each([
    [null, "/account"],
    ["", "/account"],
    ["/pricing", "/pricing"],
    ["/account", "/account"],
    ["/claim", "/claim"],
    ["/", "/"],
    ["//evil.com", "/account"],
    ["https://evil.com/x", "/account"],
    ["/pricing?x=1", "/account"],
    ["/account?next=/", "/account"],
  ] as const)("maps %j to %s", (input, expected) => {
    expect(sanitizeInternalCallbackUrl(input)).toBe(expected);
  });
});

describe("emailSignInOptions", () => {
  it("uses sanitized callbackUrl", () => {
    expect(emailSignInOptions("a@b.com", "/pricing")).toEqual({
      email: "a@b.com",
      redirect: false,
      callbackUrl: "/pricing",
    });
    expect(emailSignInOptions("a@b.com", "//evil")).toEqual({
      email: "a@b.com",
      redirect: false,
      callbackUrl: "/account",
    });
  });
});
