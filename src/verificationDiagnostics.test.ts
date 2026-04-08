import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  RECONCILER_INCOMPLETE_VERIFICATION_CODES,
  RESOLVE_FAILURE_CODES,
  failureDiagnosticForEventSequenceCode,
  failureDiagnosticForRunLevelCode,
  failureDiagnosticForStep,
  formatVerificationTargetSummary,
  withFailureDiagnostic,
} from "./verificationDiagnostics.js";
import { createEmptyVerificationRunContext } from "./verificationRunContext.js";
import type { StepOutcome, StepVerificationRequest } from "./types.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function step(
  partial: Partial<StepOutcome> & Pick<StepOutcome, "seq" | "toolId" | "status">,
): StepOutcome {
  return {
    intendedEffect: { narrative: "" },
    observedExecution: { paramsCanonical: "{}" },
    verificationRequest: null,
    reasons: [],
    evidenceSummary: {},
    repeatObservationCount: 1,
    evaluatedObservationOrdinal: 1,
    ...partial,
  };
}

describe("failureDiagnosticForStep", () => {
  it("verified omits property via withFailureDiagnostic", () => {
    const s = withFailureDiagnostic(step({ seq: 0, toolId: "t", status: "verified" }));
    expect(s.failureDiagnostic).toBeUndefined();
  });

  it("uncertain → observation_uncertainty", () => {
    expect(
      failureDiagnosticForStep(
        step({
          seq: 0,
          toolId: "t",
          status: "uncertain",
          reasons: [{ code: "ROW_NOT_OBSERVED_WITHIN_WINDOW", message: "m" }],
        }),
      ),
    ).toBe("observation_uncertainty");
  });

  it("missing / inconsistent / partially_verified → workflow_execution", () => {
    expect(failureDiagnosticForStep(step({ seq: 0, toolId: "t", status: "missing", reasons: [{ code: "ROW_ABSENT", message: "m" }] }))).toBe(
      "workflow_execution",
    );
    expect(
      failureDiagnosticForStep(
        step({
          seq: 0,
          toolId: "t",
          status: "inconsistent",
          reasons: [{ code: "VALUE_MISMATCH", message: "m" }],
        }),
      ),
    ).toBe("workflow_execution");
    expect(
      failureDiagnosticForStep(
        step({
          seq: 0,
          toolId: "t",
          status: "partially_verified",
          reasons: [{ code: "MULTI_EFFECT_PARTIAL", message: "m" }],
        }),
      ),
    ).toBe("workflow_execution");
  });

  it("incomplete RETRY_OBSERVATIONS_DIVERGE → workflow_execution", () => {
    expect(
      failureDiagnosticForStep(
        step({
          seq: 0,
          toolId: "t",
          status: "incomplete_verification",
          reasons: [{ code: "RETRY_OBSERVATIONS_DIVERGE", message: "m" }],
        }),
      ),
    ).toBe("workflow_execution");
  });

  it("incomplete MULTI_EFFECT_INCOMPLETE → verification_setup", () => {
    expect(
      failureDiagnosticForStep(
        step({
          seq: 0,
          toolId: "t",
          status: "incomplete_verification",
          reasons: [{ code: "MULTI_EFFECT_INCOMPLETE", message: "m" }],
        }),
      ),
    ).toBe("verification_setup");
  });

  it("incomplete UNKNOWN_TOOL → verification_setup", () => {
    expect(
      failureDiagnosticForStep(
        step({
          seq: 0,
          toolId: "t",
          status: "incomplete_verification",
          reasons: [{ code: "UNKNOWN_TOOL", message: "m" }],
        }),
      ),
    ).toBe("verification_setup");
  });

  it("incomplete CONNECTOR_ERROR / ROW_SHAPE_MISMATCH / UNREADABLE_VALUE → verification_setup", () => {
    for (const code of ["CONNECTOR_ERROR", "ROW_SHAPE_MISMATCH", "UNREADABLE_VALUE"] as const) {
      expect(
        failureDiagnosticForStep(
          step({
            seq: 0,
            toolId: "t",
            status: "incomplete_verification",
            reasons: [{ code, message: "m" }],
          }),
        ),
      ).toBe("verification_setup");
    }
  });

  it("incomplete with each RESOLVE_FAILURE_CODES representative → verification_setup", () => {
    for (const code of RESOLVE_FAILURE_CODES) {
      expect(
        failureDiagnosticForStep(
          step({
            seq: 0,
            toolId: "t",
            status: "incomplete_verification",
            reasons: [{ code, message: "m" }],
          }),
        ),
      ).toBe("verification_setup");
    }
  });
});

describe("RESOLVE_FAILURE_CODES parity with resolveExpectation.ts", () => {
  it("every ok:false code literal in resolveExpectation.ts appears in RESOLVE_FAILURE_CODES", () => {
    const src = readFileSync(path.join(root, "src", "resolveExpectation.ts"), "utf8");
    const re = /code:\s*"([A-Z][A-Z0-9_]*)"/g;
    const fromFile = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      fromFile.add(m[1]!);
    }
    const allowedOnWire = new Set([
      "REGISTRY_DUPLICATE_TOOL_ID",
      ...RESOLVE_FAILURE_CODES,
    ]);
    for (const c of fromFile) {
      if (!allowedOnWire.has(c)) {
        throw new Error(`Unexpected code in resolveExpectation.ts not in RESOLVE_FAILURE_CODES: ${c}`);
      }
    }
  });
});

describe("RECONCILER_INCOMPLETE_VERIFICATION_CODES", () => {
  it("is the closed set of reconciler-produced incomplete_verification reason codes", () => {
    expect([...RECONCILER_INCOMPLETE_VERIFICATION_CODES].sort()).toEqual(
      ["CONNECTOR_ERROR", "ROW_SHAPE_MISMATCH", "UNREADABLE_VALUE"].sort(),
    );
  });
});

describe("failureDiagnosticForRunLevelCode / failureDiagnosticForEventSequenceCode", () => {
  it("run-level catalog codes map to workflow_execution", () => {
    expect(failureDiagnosticForRunLevelCode("MALFORMED_EVENT_LINE")).toBe("workflow_execution");
    expect(failureDiagnosticForRunLevelCode("NO_STEPS_FOR_WORKFLOW")).toBe("workflow_execution");
  });

  it("event-sequence codes map to workflow_execution", () => {
    expect(failureDiagnosticForEventSequenceCode("CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ")).toBe("workflow_execution");
    expect(failureDiagnosticForEventSequenceCode("TIMESTAMP_NOT_MONOTONIC_WITH_SEQ_SORT_ORDER")).toBe("workflow_execution");
  });
});

describe("formatVerificationTargetSummary", () => {
  const sqlRowReq: StepVerificationRequest = {
    kind: "sql_row",
    table: "contacts",
    identityEq: [{ column: "id", value: "c1" }],
    requiredFields: { name: "A", status: "ok" },
  };

  it("sql_row includes table, identity, sorted field names", () => {
    const s = formatVerificationTargetSummary(sqlRowReq);
    expect(s).toContain("table=contacts");
    expect(s).toContain("identity=[");
    expect(s).toContain("id=c1");
    expect(s).toContain("name");
    expect(s).toContain("status");
  });

  it("null request returns null", () => {
    expect(formatVerificationTargetSummary(null)).toBeNull();
  });

  it("sql_relational lists check ids and kinds", () => {
    const req: StepVerificationRequest = {
      kind: "sql_relational",
      checks: [
        {
          checkKind: "related_exists",
          id: "b",
          childTable: "c",
          matchEq: [{ column: "k", value: "1" }],
        },
        { checkKind: "aggregate", id: "a", table: "t", fn: "COUNT_STAR", whereEq: [], expectOp: "eq", expectValue: 0 },
      ],
    };
    const s = formatVerificationTargetSummary(req);
    expect(s).toContain("sql_relational count=2");
    expect(s).toContain("a:aggregate");
    expect(s).toContain("b:related_exists");
    expect(s).not.toContain("b:related_exists:m");
  });

  it("sql_relational related_exists with composite matchEq uses mN suffix", () => {
    const req: StepVerificationRequest = {
      kind: "sql_relational",
      checks: [
        {
          checkKind: "related_exists",
          id: "b",
          childTable: "c",
          matchEq: [
            { column: "k", value: "1" },
            { column: "a", value: "1" },
            { column: "b", value: "2" },
          ],
        },
      ],
    };
    const s = formatVerificationTargetSummary(req);
    expect(s).toContain("b:related_exists:m3");
  });
});

describe("stderr category parity with JSON failureDiagnostic", () => {
  it("mixed failing steps: category line matches failureDiagnostic string", async () => {
    const { formatWorkflowTruthReport } = await import("./workflowTruthReport.js");
    const vr: StepVerificationRequest = {
      kind: "sql_row",
      table: "t",
      identityEq: [{ column: "id", value: "1" }],
      requiredFields: { a: "b" },
    };
    const result = {
      schemaVersion: 8 as const,
      workflowId: "w",
      status: "inconsistent" as const,
      runLevelReasons: [] as { code: string; message: string }[],
      verificationPolicy: { consistencyMode: "strong" as const, verificationWindowMs: 0, pollIntervalMs: 0 },
      eventSequenceIntegrity: { kind: "normal" as const },
      verificationRunContext: createEmptyVerificationRunContext(),
      steps: [
        withFailureDiagnostic(
          step({
            seq: 0,
            toolId: "t1",
            status: "missing",
            verificationRequest: vr,
            reasons: [{ code: "ROW_ABSENT", message: "m" }],
          }),
        ),
        withFailureDiagnostic(
          step({
            seq: 1,
            toolId: "t2",
            status: "incomplete_verification",
            reasons: [{ code: "UNKNOWN_TOOL", message: "m" }],
          }),
        ),
      ],
    };
    const text = formatWorkflowTruthReport(result);
    expect(text).toContain("failure_category=workflow_execution");
    expect(text).toContain("failure_category=verification_setup");
    expect(text).toContain("expected:");
    const block0 = text.split("  - seq=0 ")[1]!.split("  - seq=1 ")[0]!;
    expect(block0).toContain(`failure_category=${result.steps[0]!.failureDiagnostic}`);
    const block1 = text.split("  - seq=1 ")[1]!;
    expect(block1).toContain(`failure_category=${result.steps[1]!.failureDiagnostic}`);
  });
});
