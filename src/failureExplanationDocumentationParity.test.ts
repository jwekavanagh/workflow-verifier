import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as failureExplanation from "./failureExplanation.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const docPath = path.join(root, "docs", "execution-truth-layer.md");

const FE_TEMPLATE_EXPORT_NAMES = [
  "FE_RUN_LEVEL_EXPECTED",
  "FE_RUN_LEVEL_OBSERVED",
  "FE_RUN_LEVEL_DIVERGENCE",
  "FE_EVENT_SEQUENCE_EXPECTED",
  "FE_EVENT_SEQUENCE_OBSERVED",
  "FE_EVENT_SEQUENCE_DIVERGENCE",
  "FE_RUN_CONTEXT_EXPECTED",
  "FE_RUN_CONTEXT_OBSERVED",
  "FE_RUN_CONTEXT_DIVERGENCE",
  "FE_STEP_EXPECTED",
  "FE_STEP_OBSERVED",
  "FE_STEP_DIVERGENCE",
  "FE_NO_STEPS_OBSERVED",
  "FE_NO_STEPS_DIVERGENCE",
] as const;

function extractFailureExplanationFence(docText: string, exportName: string): string {
  const open = `\`\`\`text failureExplanation.ts ${exportName}`;
  const start = docText.indexOf(open);
  if (start === -1) {
    throw new Error(`Missing fence opening for ${exportName}`);
  }
  const nl = docText.indexOf("\n", start);
  if (nl === -1) throw new Error(`Malformed fence for ${exportName}`);
  const contentStart = nl + 1;
  const close = docText.indexOf("\n```", contentStart);
  if (close === -1) throw new Error(`Missing fence close for ${exportName}`);
  return docText
    .slice(contentStart, close)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "")
    .replace(/\n+$/, "");
}

describe("failureExplanation documentation template parity", () => {
  it("execution-truth-layer.md fenced templates match failureExplanation.ts exports", () => {
    const docText = readFileSync(docPath, "utf8");
    const mod = failureExplanation as Record<string, string>;
    for (const name of FE_TEMPLATE_EXPORT_NAMES) {
      const fromDoc = extractFailureExplanationFence(docText, name);
      const fromCode = mod[name];
      expect(fromCode, `export ${name} must exist`).toBeDefined();
      expect(fromDoc).toBe(fromCode);
    }
  });
});
