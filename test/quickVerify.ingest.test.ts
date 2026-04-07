import { describe, expect, it } from "vitest";
import { dedupeActions, ingestActivityUtf8 } from "../src/quickVerify/ingest.js";
import { stableStringify } from "../src/quickVerify/canonicalJson.js";

describe("ingestActivityUtf8", () => {
  it("returns INGEST_NO_ACTIONS for empty buffer", () => {
    const r = ingestActivityUtf8("");
    expect(r.actions).toEqual([]);
    expect(r.reasonCodes).toEqual(["INGEST_NO_ACTIONS"]);
    expect(r.malformedLineCount).toBe(0);
  });

  it("returns two MALFORMED_LINE then INGEST_NO_ACTIONS for two bad lines", () => {
    const r = ingestActivityUtf8("notjson\nalsobad");
    expect(r.actions).toEqual([]);
    expect(r.reasonCodes).toEqual(["MALFORMED_LINE", "MALFORMED_LINE", "INGEST_NO_ACTIONS"]);
    expect(r.malformedLineCount).toBe(2);
  });

  it("parses second line after malformed first", () => {
    const r = ingestActivityUtf8(
      'notjson\n{"toolId":"t","params":{"id":"1"}}\n',
    );
    expect(r.actions.length).toBe(1);
    expect(r.reasonCodes).toEqual(["MALFORMED_LINE"]);
    expect(r.actions[0]?.toolName).toBe("t");
  });

  it("INGEST_INPUT_TOO_LARGE", () => {
    const huge = "x".repeat(8_388_609);
    const r = ingestActivityUtf8(huge);
    expect(r.reasonCodes).toEqual(["INGEST_INPUT_TOO_LARGE"]);
    expect(r.inputTooLarge).toBe(true);
  });
});

describe("dedupeActions", () => {
  it("drops duplicate tool+params", () => {
    const r = dedupeActions([
      { toolName: "x", params: { id: "1" } },
      { toolName: "x", params: { id: "1" } },
    ]);
    expect(r.unique).toHaveLength(1);
    expect(r.droppedWarnings).toEqual(["DEDUPE_DROPPED"]);
  });
});

describe("stableStringify golden", () => {
  it("sorts object keys UTF-16", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});
