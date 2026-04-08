import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  QUICK_VERIFY_BANNER_LINE_1,
  QUICK_VERIFY_BANNER_LINE_2,
} from "./quickVerify/formatQuickVerifyHumanReport.js";
import { MSG_NO_STRUCTURED_TOOL_ACTIVITY, MSG_NO_TOOL_CALLS } from "./quickVerify/quickVerifyHumanCopy.js";
import { INGEST_AND_QUICK_MISC_PHRASES, SQL_VERIFICATION_PHRASES } from "./verificationUserPhrases.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(root, "docs");

/** Canonical UX strings that must not appear verbatim in docs except in cited fences. */
const CANONICAL_UX_STRING_EXPORTS: string[] = [
  MSG_NO_TOOL_CALLS,
  MSG_NO_STRUCTURED_TOOL_ACTIVITY,
  QUICK_VERIFY_BANNER_LINE_1,
  QUICK_VERIFY_BANNER_LINE_2,
  INGEST_AND_QUICK_MISC_PHRASES.MALFORMED_LINE,
  SQL_VERIFICATION_PHRASES.ROW_ABSENT,
];

const README_EXEMPT_SUBSTRINGS = [
  "This path expects structured tool activity in your paste—tool names and parameters the engine can extract as JSON—not arbitrary unstructured logs.",
  "Verification uses read-only SQL against your database; API-only or non-SQL systems are out of scope for this tool.",
];

const FENCE_INFO_KEYWORDS = [
  "quickVerifyHumanCopy",
  "verificationUserPhrases",
  "formatQuickVerifyHumanReport",
  "workflowTruthReport",
];

/** [contentStart, contentEnd) inside ``` fences whose info line cites a TS source. */
function citedFenceContentRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  let inFence = false;
  let fenceInfo = "";
  let contentStart = 0;
  while (i < text.length) {
    if (text.startsWith("```", i)) {
      const lineEnd = text.indexOf("\n", i);
      if (lineEnd === -1) break;
      const infoLine = text.slice(i + 3, lineEnd).trim();
      if (!inFence) {
        fenceInfo = infoLine;
        inFence = true;
        contentStart = lineEnd + 1;
      } else {
        const contentEnd = i;
        if (FENCE_INFO_KEYWORDS.some((k) => fenceInfo.includes(k))) {
          out.push([contentStart, contentEnd]);
        }
        inFence = false;
      }
      i = lineEnd + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

function rangeFullyInsideRanges(
  start: number,
  end: number,
  ranges: [number, number][],
): boolean {
  return ranges.some(([a, b]) => start >= a && end <= b);
}

describe("documentationCopyConsistency", () => {
  it("docs/*.md do not duplicate canonical UX strings outside cited code fences", () => {
    const names = readdirSync(docsDir).filter((f) => f.endsWith(".md"));
    for (const name of names) {
      const docPath = path.join(docsDir, name);
      const docText = readFileSync(docPath, "utf8");
      const ranges = citedFenceContentRanges(docText);
      for (const s of CANONICAL_UX_STRING_EXPORTS) {
        if (s.length < 12) continue;
        let idx = 0;
        while (idx < docText.length) {
          const j = docText.indexOf(s, idx);
          if (j === -1) break;
          const ok = rangeFullyInsideRanges(j, j + s.length, ranges);
          expect(
            ok,
            `${name}: substring must only appear inside a fence citing TS source (${s.slice(0, 50)}…)`,
          ).toBe(true);
          idx = j + s.length;
        }
      }
    }
  });

  it("README required sentences are present (exempt from doc guard)", () => {
    const readme = readFileSync(path.join(root, "README.md"), "utf8");
    for (const s of README_EXEMPT_SUBSTRINGS) {
      expect(readme.includes(s), `README must include required sentence`).toBe(true);
    }
  });
});
