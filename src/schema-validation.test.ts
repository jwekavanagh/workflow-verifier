import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadSchemaValidator } from "./schemaLoad.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("JSON Schemas (SSOT)", () => {
  it("validates tool_observed event lines", () => {
    const v = loadSchemaValidator("event");
    const line = JSON.parse(
      readFileSync(path.join(root, "examples", "events.ndjson"), "utf8").split("\n")[0]!,
    );
    expect(v(line)).toBe(true);
  });

  it("rejects event with embedded expectation", () => {
    const v = loadSchemaValidator("event");
    const bad = {
      schemaVersion: 1,
      workflowId: "w",
      seq: 0,
      type: "tool_observed",
      toolId: "t",
      params: {},
      expectation: {},
    };
    expect(v(bad)).toBe(false);
  });

  it("validates tools registry", () => {
    const v = loadSchemaValidator("tools-registry");
    const reg = JSON.parse(readFileSync(path.join(root, "examples", "tools.json"), "utf8"));
    expect(v(reg)).toBe(true);
  });

  it("validates workflow result shape from golden pipeline output", () => {
    const v = loadSchemaValidator("workflow-result");
    const result = {
      schemaVersion: 1,
      workflowId: "wf_complete",
      status: "complete",
      runLevelCodes: [],
      steps: [
        {
          seq: 0,
          toolId: "crm.upsert_contact",
          intendedEffect: "x",
          verificationRequest: {
            kind: "sql_row",
            table: "contacts",
            keyColumn: "id",
            keyValue: "c_ok",
            requiredFields: { name: "Alice" },
          },
          status: "verified",
          reasons: [],
          evidenceSummary: { rowCount: 1 },
        },
      ],
    };
    expect(v(result)).toBe(true);
  });
});
