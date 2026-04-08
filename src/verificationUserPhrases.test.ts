import { describe, expect, it } from "vitest";
import { ACTION_INPUT_REASON_CODES, RECONCILER_STEP_REASON_CODES } from "./executionPathFindings.js";
import { EVENT_SEQUENCE_MESSAGES, RUN_LEVEL_MESSAGES } from "./failureCatalog.js";
import {
  INGEST_AND_QUICK_MISC_PHRASES,
  isFallbackUserPhrase,
  REGISTRY_RESOLVER_PHRASES,
  SQL_VERIFICATION_PHRASES,
  userPhraseForReasonCode,
} from "./verificationUserPhrases.js";
import { REGISTRY_RESOLVER_CODE, SQL_VERIFICATION_OUTCOME_CODE } from "./wireReasonCodes.js";

describe("verificationUserPhrases", () => {
  it("defines a phrase for every SQL_VERIFICATION_OUTCOME_CODE", () => {
    for (const c of Object.values(SQL_VERIFICATION_OUTCOME_CODE)) {
      expect(SQL_VERIFICATION_PHRASES[c].length).toBeGreaterThan(0);
      expect(isFallbackUserPhrase(userPhraseForReasonCode(c))).toBe(false);
    }
  });

  it("defines a phrase for every REGISTRY_RESOLVER_CODE", () => {
    for (const c of Object.values(REGISTRY_RESOLVER_CODE)) {
      expect(REGISTRY_RESOLVER_PHRASES[c].length).toBeGreaterThan(0);
      expect(isFallbackUserPhrase(userPhraseForReasonCode(c))).toBe(false);
    }
  });

  it("defines ingest/misc phrases", () => {
    for (const c of Object.keys(INGEST_AND_QUICK_MISC_PHRASES) as (keyof typeof INGEST_AND_QUICK_MISC_PHRASES)[]) {
      expect(isFallbackUserPhrase(userPhraseForReasonCode(c))).toBe(false);
    }
  });

  it("covers run-level and event-sequence codes used in truth report", () => {
    for (const c of Object.keys(RUN_LEVEL_MESSAGES) as (keyof typeof RUN_LEVEL_MESSAGES)[]) {
      expect(isFallbackUserPhrase(userPhraseForReasonCode(c))).toBe(false);
    }
    for (const c of Object.keys(EVENT_SEQUENCE_MESSAGES) as (keyof typeof EVENT_SEQUENCE_MESSAGES)[]) {
      expect(isFallbackUserPhrase(userPhraseForReasonCode(c))).toBe(false);
    }
    expect(isFallbackUserPhrase(userPhraseForReasonCode("TIMESTAMP_NOT_MONOTONIC_WITH_SEQ_SORT_ORDER"))).toBe(
      false,
    );
  });

  it("reconciler and action-input step codes never use fallback", () => {
    for (const c of RECONCILER_STEP_REASON_CODES) {
      expect(isFallbackUserPhrase(userPhraseForReasonCode(c))).toBe(false);
    }
    for (const c of ACTION_INPUT_REASON_CODES) {
      expect(isFallbackUserPhrase(userPhraseForReasonCode(c))).toBe(false);
    }
  });

  it("MAPPING_* uses template without fallback", () => {
    expect(userPhraseForReasonCode("MAPPING_LOW_CONFIDENCE")).toBe("Mapping: low confidence.");
    expect(userPhraseForReasonCode("MAPPING_FAILED")).toBe("Mapping: failed.");
    expect(isFallbackUserPhrase(userPhraseForReasonCode("MAPPING_FOO"))).toBe(false);
  });
});
