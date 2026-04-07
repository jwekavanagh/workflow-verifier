import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { loadSchemaValidator } from "./schemaLoad.js";
import { RUN_LEVEL_MESSAGES } from "./failureCatalog.js";
import { TruthLayerError } from "./truthLayerError.js";
import {
  structuralIssuesFromToolsRegistryAjv,
  validateToolsRegistry,
} from "./registryValidation.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("registryValidation", () => {
  it("structuralIssuesFromToolsRegistryAjv sorts by instancePath then keyword", () => {
    const v = loadSchemaValidator("tools-registry");
    const bad = [{}];
    expect(v(bad)).toBe(false);
    const issues = structuralIssuesFromToolsRegistryAjv(v.errors ?? null);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.kind === "json_schema")).toBe(true);
  });

  it("validateToolsRegistry throws when eventsPath without workflowId", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-rv-"));
    try {
      const reg = join(dir, "r.json");
      writeFileSync(reg, readFileSync(join(root, "examples", "tools.json"), "utf8"));
      expect(() =>
        validateToolsRegistry({ registryPath: reg, eventsPath: join(root, "examples", "events.ndjson") }),
      ).toThrow(TruthLayerError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects empty registry array (json_schema)", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-rv-"));
    try {
      const reg = join(dir, "r.json");
      writeFileSync(reg, "[]");
      const r = validateToolsRegistry({ registryPath: reg });
      expect(r.valid).toBe(false);
      expect(r.structuralIssues.some((s) => s.kind === "json_schema")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("duplicate toolId → structural duplicate_tool_id", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-rv-"));
    try {
      const reg = join(dir, "r.json");
      const one = JSON.parse(readFileSync(join(root, "examples", "tools.json"), "utf8"))[0];
      writeFileSync(reg, JSON.stringify([one, one]));
      const r = validateToolsRegistry({ registryPath: reg });
      expect(r.valid).toBe(false);
      expect(r.structuralIssues.some((s) => s.kind === "duplicate_tool_id")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("sql_relational duplicate check id → structural", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-rv-rel-"));
    try {
      const reg = join(dir, "r.json");
      const payload = [
        {
          toolId: "t.rel.dup",
          effectDescriptionTemplate: "x",
          verification: {
            kind: "sql_relational",
            checks: [
              {
                checkKind: "related_exists",
                id: "same",
                childTable: { const: "c" },
                matchEq: [{ column: { const: "p" }, value: { const: "1" } }],
              },
              {
                checkKind: "aggregate",
                id: "same",
                table: { const: "t" },
                fn: "COUNT_STAR",
                expect: { op: "eq", value: { const: 0 } },
              },
            ],
          },
        },
      ];
      writeFileSync(reg, JSON.stringify(payload));
      const r = validateToolsRegistry({ registryPath: reg });
      expect(r.valid).toBe(false);
      expect(r.structuralIssues[0]!.kind).toBe("sql_relational_duplicate_check_id");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("sql_effects duplicate effect id → structural", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-rv-"));
    try {
      const reg = join(dir, "r.json");
      const payload = [
        {
          toolId: "t.multi",
          effectDescriptionTemplate: "x",
          verification: {
            kind: "sql_effects",
            effects: [
              {
                id: "a",
                table: { const: "t1" },
                identityEq: [{ column: { const: "id" }, value: { const: "1" } }],
                requiredFields: { pointer: "/f" },
              },
              {
                id: "a",
                table: { const: "t2" },
                identityEq: [{ column: { const: "id" }, value: { const: "2" } }],
                requiredFields: { pointer: "/f" },
              },
            ],
          },
        },
      ];
      writeFileSync(reg, JSON.stringify(payload));
      const r = validateToolsRegistry({ registryPath: reg });
      expect(r.valid).toBe(false);
      expect(r.structuralIssues.some((s) => s.kind === "sql_effects_duplicate_effect_id")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("NO_STEPS_FOR_WORKFLOW when no events for workflow id", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-rv-"));
    try {
      const reg = join(dir, "r.json");
      writeFileSync(reg, readFileSync(join(root, "examples", "tools.json"), "utf8"));
      const r = validateToolsRegistry({
        registryPath: reg,
        eventsPath: join(root, "examples", "events.ndjson"),
        workflowId: "wf_nonexistent___",
      });
      expect(r.valid).toBe(false);
      expect(r.resolutionIssues).toHaveLength(1);
      expect(r.resolutionIssues[0]!.code).toBe("NO_STEPS_FOR_WORKFLOW");
      expect(r.resolutionIssues[0]!.message).toBe(RUN_LEVEL_MESSAGES.NO_STEPS_FOR_WORKFLOW);
      expect(r.resolutionIssues[0]!.seq).toBeNull();
      expect(r.resolutionIssues[0]!.toolId).toBeNull();
      expect(r.eventLoad?.malformedEventLineCount).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("divergent retry → resolutionSkipped, valid true", () => {
    const r = validateToolsRegistry({
      registryPath: join(root, "examples", "tools.json"),
      eventsPath: join(root, "examples", "events.ndjson"),
      workflowId: "wf_divergent_retry",
    });
    expect(r.valid).toBe(true);
    expect(r.resolutionSkipped).toHaveLength(1);
    expect(r.resolutionSkipped[0]!.code).toBe("RETRY_OBSERVATIONS_DIVERGE");
  });

  it("unknown tool in events → resolution issue", () => {
    const r = validateToolsRegistry({
      registryPath: join(root, "examples", "tools.json"),
      eventsPath: join(root, "examples", "events.ndjson"),
      workflowId: "wf_unknown_tool",
    });
    expect(r.valid).toBe(false);
    expect(r.resolutionIssues.some((i) => i.code === "UNKNOWN_TOOL")).toBe(true);
  });

  it("wf_complete + bundled registry → valid", () => {
    const r = validateToolsRegistry({
      registryPath: join(root, "examples", "tools.json"),
      eventsPath: join(root, "examples", "events.ndjson"),
      workflowId: "wf_complete",
    });
    expect(r.valid).toBe(true);
    expect(r.eventLoad?.workflowId).toBe("wf_complete");
  });
});
