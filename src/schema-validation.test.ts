import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildRunComparisonReport } from "./runComparison.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import type { StepOutcome, WorkflowResult } from "./types.js";

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
      schemaVersion: 4,
      workflowId: "wf_complete",
      status: "complete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
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
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    expect(v(result)).toBe(true);
  });

  it("validates multi-effect workflow result (sql_effects + evidenceSummary.effects)", () => {
    const v = loadSchemaValidator("workflow-result");
    const result = {
      schemaVersion: 4,
      workflowId: "wf_multi",
      status: "inconsistent",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "demo.multi",
          intendedEffect: "x",
          verificationRequest: {
            kind: "sql_effects",
            effects: [
              {
                id: "a",
                kind: "sql_row",
                table: "contacts",
                keyColumn: "id",
                keyValue: "c1",
                requiredFields: { name: "A" },
              },
              {
                id: "b",
                kind: "sql_row",
                table: "contacts",
                keyColumn: "id",
                keyValue: "c2",
                requiredFields: { name: "B" },
              },
            ],
          },
          status: "partially_verified",
          reasons: [{ code: "MULTI_EFFECT_PARTIAL", message: "Verified 1 of 2 effects; not verified: b" }],
          evidenceSummary: {
            effectCount: 2,
            effects: [
              {
                id: "a",
                status: "verified",
                reasons: [],
                evidenceSummary: { rowCount: 1 },
              },
              {
                id: "b",
                status: "inconsistent",
                reasons: [{ code: "VALUE_MISMATCH", message: "Expected \"B\" but found \"X\" for field name" }],
                evidenceSummary: { rowCount: 1, field: "name" },
              },
            ],
          },
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    expect(v(result)).toBe(true);
  });

  it("rejects single-effect step evidenceSummary with effectCount", () => {
    const v = loadSchemaValidator("workflow-result");
    const bad = {
      schemaVersion: 4,
      workflowId: "w",
      status: "complete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
      steps: [
        {
          seq: 0,
          toolId: "t",
          intendedEffect: "",
          verificationRequest: {
            kind: "sql_row",
            table: "contacts",
            keyColumn: "id",
            keyValue: "1",
            requiredFields: {},
          },
          status: "verified",
          reasons: [],
          evidenceSummary: { rowCount: 1, effectCount: 2 },
          repeatObservationCount: 1,
          evaluatedObservationOrdinal: 1,
        },
      ],
    };
    expect(v(bad)).toBe(false);
  });

  it("validates RunComparisonReport from buildRunComparisonReport", () => {
    const v = loadSchemaValidator("run-comparison-report");
    const step = (seq: number, kv: string, ok: boolean): StepOutcome => ({
      seq,
      toolId: "t",
      intendedEffect: "",
      verificationRequest: {
        kind: "sql_row",
        table: "contacts",
        keyColumn: "id",
        keyValue: kv,
        requiredFields: {},
      },
      status: ok ? "verified" : "missing",
      reasons: ok ? [] : [{ code: "ROW_ABSENT", message: "m" }],
      evidenceSummary: {},
      repeatObservationCount: 1,
      evaluatedObservationOrdinal: 1,
    });
    const r0: WorkflowResult = {
      schemaVersion: 4,
      workflowId: "w",
      status: "complete",
      runLevelCodes: [],
      runLevelReasons: [],
      verificationPolicy: {
        consistencyMode: "strong",
        verificationWindowMs: 0,
        pollIntervalMs: 0,
      },
      eventSequenceIntegrity: { kind: "normal" },
      steps: [step(0, "a", true)],
    };
    const r1: WorkflowResult = { ...r0, steps: [step(0, "a", true)] };
    const report = buildRunComparisonReport([r0, r1], ["x", "y"]);
    expect(v(report)).toBe(true);
  });
});
