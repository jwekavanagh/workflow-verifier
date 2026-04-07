import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLI_OPERATIONAL_CODES } from "./cliOperationalCodes.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import { TruthLayerError } from "./truthLayerError.js";
import {
  buildPlanTransitionEventsNdjson,
  buildPlanTransitionWorkflowResult,
  evaluatePlanRules,
  loadPlanTransitionRules,
  parseGitNameStatusZ,
  parseGitVersionTriple,
  PLAN_RULE_CODES,
  preflightAllPlanPatterns,
  preflightPatternString,
  type PlanDiffRow,
} from "./planTransition.js";
import { PLAN_TRANSITION_WORKFLOW_ID } from "./planTransitionConstants.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function gitConfig(repo: string): void {
  execFileSync("git", ["-C", repo, "config", "user.email", "pt@test.local"], { windowsHide: true });
  execFileSync("git", ["-C", repo, "config", "user.name", "PlanTransition Test"], { windowsHide: true });
}

describe("planTransition", () => {
  it("parseGitVersionTriple parses semver prefix", () => {
    expect(parseGitVersionTriple("git version 2.43.0.windows.1")).toEqual([2, 43, 0]);
    expect(parseGitVersionTriple("git version 2.30.0")).toEqual([2, 30, 0]);
    expect(parseGitVersionTriple("git version 2.29.0")).toEqual([2, 29, 0]);
    expect(parseGitVersionTriple("bogus")).toBeNull();
  });

  it("parseGitNameStatusZ parses golden NUL buffers per status class", () => {
    const cases: Array<{ buf: Buffer; want: ReturnType<typeof parseGitNameStatusZ> }> = [
      {
        buf: Buffer.from("A\0f.txt\0", "utf8"),
        want: [{ rowKind: "add", paths: ["f.txt"] }],
      },
      {
        buf: Buffer.from("M\0m.txt\0", "utf8"),
        want: [{ rowKind: "modify", paths: ["m.txt"] }],
      },
      {
        buf: Buffer.from("D\0d.txt\0", "utf8"),
        want: [{ rowKind: "delete", paths: ["d.txt"] }],
      },
      {
        buf: Buffer.from("T\0t.txt\0", "utf8"),
        want: [{ rowKind: "type_change", paths: ["t.txt"] }],
      },
      {
        buf: Buffer.from("U\0u.txt\0", "utf8"),
        want: [{ rowKind: "unmerged", paths: ["u.txt"] }],
      },
      {
        buf: Buffer.from("R100\0old/path.txt\0new/path.txt\0", "utf8"),
        want: [{ rowKind: "rename", paths: ["old/path.txt", "new/path.txt"] }],
      },
      {
        buf: Buffer.from("C095\0src/original.ts\0src/copy.ts\0", "utf8"),
        want: [{ rowKind: "copy", paths: ["src/original.ts", "src/copy.ts"] }],
      },
    ];
    for (const { buf, want } of cases) {
      expect(parseGitNameStatusZ(buf)).toEqual(want);
    }
  });

  it("parseGitNameStatusZ rejects unknown status", () => {
    expect(() => parseGitNameStatusZ(Buffer.from("X\0a\0", "utf8"))).toThrow(TruthLayerError);
  });

  it("requireRenameFromTo includeCopy true vs false on injected copy row", () => {
    const rows: PlanDiffRow[] = [{ rowKind: "copy", paths: ["src/original.ts", "src/copy.ts"] }];
    const okRule = {
      id: "r1",
      kind: "requireRenameFromTo" as const,
      fromPattern: "src/original.ts",
      toPattern: "src/copy.ts",
      includeCopy: true,
    };
    const badRule = { ...okRule, includeCopy: false };
    expect(evaluatePlanRules(rows, [okRule])[0]?.status).toBe("verified");
    expect(evaluatePlanRules(rows, [badRule])[0]?.status).toBe("inconsistent");
    expect(evaluatePlanRules(rows, [badRule])[0]?.reasons[0]?.code).toBe(PLAN_RULE_CODES.RENAME_MISMATCH);
  });

  it("matchingRowsMustHaveRowKinds fails on add when modify required", () => {
    const rows: PlanDiffRow[] = [{ rowKind: "add", paths: ["x.txt"] }];
    const rule = {
      id: "r1",
      kind: "matchingRowsMustHaveRowKinds" as const,
      pattern: "x.txt",
      rowKinds: ["modify" as const],
    };
    const step = evaluatePlanRules(rows, [rule])[0]!;
    expect(step.status).toBe("inconsistent");
    expect(step.reasons[0]?.code).toBe(PLAN_RULE_CODES.ROW_KIND_MISMATCH);
  });

  it("allChangedPathsMustMatchAllowlist catches path outside allowlist", () => {
    const rows: PlanDiffRow[] = [
      { rowKind: "modify", paths: ["good.txt"] },
      { rowKind: "add", paths: ["evil.txt"] },
    ];
    const rule = {
      id: "r1",
      kind: "allChangedPathsMustMatchAllowlist" as const,
      allowPatterns: ["good.txt"],
    };
    expect(evaluatePlanRules(rows, [rule])[0]?.status).toBe("inconsistent");
    expect(evaluatePlanRules(rows, [rule])[0]?.reasons[0]?.code).toBe(PLAN_RULE_CODES.ALLOWLIST_VIOLATION);
  });

  it("allowlist counts both paths on rename when new path outside list", () => {
    const rows: PlanDiffRow[] = [{ rowKind: "rename", paths: ["allowed/old.txt", "outside/new.txt"] }];
    const rule = {
      id: "r1",
      kind: "allChangedPathsMustMatchAllowlist" as const,
      allowPatterns: ["allowed/**"],
    };
    expect(evaluatePlanRules(rows, [rule])[0]?.status).toBe("inconsistent");
  });

  it("preflightPatternString rejects ..", () => {
    expect(() => preflightPatternString("../x", "p")).toThrow(TruthLayerError);
  });

  it("preflightAllPlanPatterns labels allowPatterns by rule index and array index", () => {
    const rules = [
      { id: "r0", kind: "forbidMatchingRows" as const, pattern: "safe" },
      {
        id: "r1",
        kind: "allChangedPathsMustMatchAllowlist" as const,
        allowPatterns: ["ok/**", "../evil"],
      },
    ];
    try {
      preflightAllPlanPatterns(rules);
      expect.fail("expected TruthLayerError");
    } catch (e) {
      expect(e).toBeInstanceOf(TruthLayerError);
      expect((e as TruthLayerError).message).toContain("rules[1].allowPatterns[1]");
      expect((e as TruthLayerError).message).not.toContain("rules[2]");
    }
  });

  it("plan-validation-core schema rejects requireRenameFromTo without includeCopy", () => {
    const v = loadSchemaValidator("plan-validation-core");
    const bad = {
      schemaVersion: 1,
      rules: [
        {
          id: "x",
          kind: "requireRenameFromTo",
          fromPattern: "a",
          toPattern: "b",
        },
      ],
    };
    expect(v(bad)).toBe(false);
  });

  it("buildPlanTransitionEventsNdjson validates against event schema", () => {
    const v = loadSchemaValidator("event");
    const buf = buildPlanTransitionEventsNdjson({
      workflowId: PLAN_TRANSITION_WORKFLOW_ID,
      beforeRef: "main~1",
      afterRef: "main",
      beforeCommitSha: "a".repeat(40),
      afterCommitSha: "b".repeat(40),
      planResolvedPath: path.join(root, "Plan.md"),
      planSha256: "c".repeat(64),
      transitionRulesSource: "front_matter",
    });
    const line = JSON.parse(buf.toString("utf8").trim());
    expect(v(line)).toBe(true);
    expect(line.params.transitionRulesSource).toBe("front_matter");
    expect(line.params.beforeCommitSha).toHaveLength(40);
    expect(line.params.planSha256).toHaveLength(64);
  });

  it("git subprocess: modify file with space in name matches parser", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-tr-"));
    execFileSync("git", ["init", dir], { windowsHide: true });
    gitConfig(dir);
    writeFileSync(path.join(dir, "a b.txt"), "1");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "c1"], { windowsHide: true });
    writeFileSync(path.join(dir, "a b.txt"), "2");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "c2"], { windowsHide: true });
    const h1 = execFileSync("git", ["-C", dir, "rev-parse", "HEAD~1"], { encoding: "utf8", windowsHide: true }).trim();
    const h2 = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    const buf = execFileSync("git", ["-C", dir, "diff", "--no-ext-diff", "-z", "--name-status", `${h1}..${h2}`], {
      windowsHide: true,
    }) as Buffer;
    const rows = parseGitNameStatusZ(buf);
    expect(rows.length).toBe(1);
    expect(rows[0]?.rowKind).toBe("modify");
    expect(rows[0]?.paths[0]).toBe("a b.txt");
  }, 20_000);

  it("integration: buildPlanTransitionWorkflowResult with Plan.md and two commits", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-tr-int-"));
    execFileSync("git", ["init", dir], { windowsHide: true });
    gitConfig(dir);
    mkdirSync(path.join(dir, "src"), { recursive: true });
    writeFileSync(path.join(dir, "src", "x.txt"), "a");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "base"], { windowsHide: true });
    const before = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    writeFileSync(path.join(dir, "src", "x.txt"), "b");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "chg"], { windowsHide: true });
    const after = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();

    const planBody = `---
planValidation:
  schemaVersion: 1
  rules:
    - id: must_modify
      kind: matchingRowsMustHaveRowKinds
      pattern: "src/x.txt"
      rowKinds: [modify]
---
# Plan
`;
    const planPath = path.join(dir, "Plan.md");
    writeFileSync(planPath, planBody, "utf8");

    const { workflowResult: result } = buildPlanTransitionWorkflowResult({
      repoRoot: dir,
      beforeRef: before,
      afterRef: after,
      planPath,
      workflowId: PLAN_TRANSITION_WORKFLOW_ID,
    });
    expect(result.workflowId).toBe(PLAN_TRANSITION_WORKFLOW_ID);
    expect(result.status).toBe("complete");
    expect(result.steps.length).toBe(1);
    expect(result.steps[0]?.status).toBe("verified");
  }, 20_000);

  it("picomatch ** pattern matches nested path for allowlist", () => {
    const rows: PlanDiffRow[] = [{ rowKind: "modify", paths: ["src/nested/foo.ts"] }];
    const rule = {
      id: "r1",
      kind: "allChangedPathsMustMatchAllowlist" as const,
      allowPatterns: ["src/**/*.ts"],
    };
    expect(evaluatePlanRules(rows, [rule])[0]?.status).toBe("verified");
  });

  it("integration: git mv satisfies requireRenameFromTo", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-tr-mv-"));
    execFileSync("git", ["init", dir], { windowsHide: true });
    gitConfig(dir);
    writeFileSync(path.join(dir, "old.txt"), "a");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "base"], { windowsHide: true });
    const before = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    execFileSync("git", ["-C", dir, "mv", "old.txt", "new.txt"], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "mv"], { windowsHide: true });
    const after = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();

    const planBody = `---
planValidation:
  schemaVersion: 1
  rules:
    - id: renamed
      kind: requireRenameFromTo
      fromPattern: "old.txt"
      toPattern: "new.txt"
      includeCopy: false
---
`;
    const planPath = path.join(dir, "Plan.md");
    writeFileSync(planPath, planBody, "utf8");

    const { workflowResult: result } = buildPlanTransitionWorkflowResult({
      repoRoot: dir,
      beforeRef: before,
      afterRef: after,
      planPath,
    });
    expect(result.status).toBe("complete");
    expect(result.steps[0]?.status).toBe("verified");
  }, 20_000);

  it("integration: add file fails when rule requires modify only", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-tr-add-"));
    execFileSync("git", ["init", dir], { windowsHide: true });
    gitConfig(dir);
    writeFileSync(path.join(dir, "x.txt"), "a");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "base"], { windowsHide: true });
    const before = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    writeFileSync(path.join(dir, "y.txt"), "new");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "add"], { windowsHide: true });
    const after = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();

    const planBody = `---
planValidation:
  schemaVersion: 1
  rules:
    - id: y_must_be_modify
      kind: matchingRowsMustHaveRowKinds
      pattern: "y.txt"
      rowKinds: [modify]
---
`;
    const planPath = path.join(dir, "Plan.md");
    writeFileSync(planPath, planBody, "utf8");

    const { workflowResult: result } = buildPlanTransitionWorkflowResult({
      repoRoot: dir,
      beforeRef: before,
      afterRef: after,
      planPath,
    });
    expect(result.status).toBe("inconsistent");
    expect(result.steps[0]?.status).toBe("inconsistent");
  }, 20_000);

  it("integration: body-section yaml rules match FM equivalent for modify", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-tr-body-"));
    execFileSync("git", ["init", dir], { windowsHide: true });
    gitConfig(dir);
    mkdirSync(path.join(dir, "src"), { recursive: true });
    writeFileSync(path.join(dir, "src", "x.txt"), "a");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "base"], { windowsHide: true });
    const before = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    writeFileSync(path.join(dir, "src", "x.txt"), "b");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "chg"], { windowsHide: true });
    const after = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();

    const planBody = `---
name: Cursor plan
overview: test
---
## Repository transition validation
\`\`\`yaml
schemaVersion: 1
rules:
  - id: must_modify
    kind: matchingRowsMustHaveRowKinds
    pattern: "src/x.txt"
    rowKinds: [modify]
\`\`\`
`;
    const planPath = path.join(dir, "Plan.md");
    writeFileSync(planPath, planBody, "utf8");

    const { workflowResult: result, transitionRulesProvenance } = buildPlanTransitionWorkflowResult({
      repoRoot: dir,
      beforeRef: before,
      afterRef: after,
      planPath,
      workflowId: PLAN_TRANSITION_WORKFLOW_ID,
    });
    expect(transitionRulesProvenance).toBe("body_section");
    expect(result.status).toBe("complete");
    expect(result.steps[0]?.status).toBe("verified");
  }, 20_000);

  it("integration: FM planValidation wins over duplicate body headings and yaml", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-tr-fmwin-"));
    execFileSync("git", ["init", dir], { windowsHide: true });
    gitConfig(dir);
    mkdirSync(path.join(dir, "src"), { recursive: true });
    writeFileSync(path.join(dir, "src", "x.txt"), "a");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "base"], { windowsHide: true });
    const before = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    writeFileSync(path.join(dir, "src", "x.txt"), "b");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "chg"], { windowsHide: true });
    const after = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();

    const planBody = `---
planValidation:
  schemaVersion: 1
  rules:
    - id: must_modify
      kind: matchingRowsMustHaveRowKinds
      pattern: "src/x.txt"
      rowKinds: [modify]
---
## Repository transition validation
## Repository transition validation
\`\`\`yaml
schemaVersion: 1
rules:
  - id: forbid_all
    kind: forbidMatchingRows
    pattern: "**/*"
\`\`\`
`;
    const planPath = path.join(dir, "Plan.md");
    writeFileSync(planPath, planBody, "utf8");

    const { workflowResult: result, transitionRulesProvenance } = buildPlanTransitionWorkflowResult({
      repoRoot: dir,
      beforeRef: before,
      afterRef: after,
      planPath,
    });
    expect(transitionRulesProvenance).toBe("front_matter");
    expect(result.status).toBe("complete");
    expect(result.steps[0]?.status).toBe("verified");
  }, 20_000);

  it("integration: FM rules used when body would forbid all paths", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-tr-prec-"));
    execFileSync("git", ["init", dir], { windowsHide: true });
    gitConfig(dir);
    mkdirSync(path.join(dir, "src"), { recursive: true });
    writeFileSync(path.join(dir, "src", "x.txt"), "a");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "base"], { windowsHide: true });
    const before = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    writeFileSync(path.join(dir, "src", "x.txt"), "b");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "chg"], { windowsHide: true });
    const after = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();

    const planBody = `---
planValidation:
  schemaVersion: 1
  rules:
    - id: must_modify
      kind: matchingRowsMustHaveRowKinds
      pattern: "src/x.txt"
      rowKinds: [modify]
---
## Repository transition validation
\`\`\`yaml
schemaVersion: 1
rules:
  - id: forbid_all
    kind: forbidMatchingRows
    pattern: "**/*"
\`\`\`
`;
    const planPath = path.join(dir, "Plan.md");
    writeFileSync(planPath, planBody, "utf8");

    const { workflowResult: result } = buildPlanTransitionWorkflowResult({
      repoRoot: dir,
      beforeRef: before,
      afterRef: after,
      planPath,
    });
    expect(result.status).toBe("complete");
    expect(result.steps[0]?.status).toBe("verified");
  }, 20_000);
});

describe("loadPlanTransitionRules", () => {
  it("Cursor-like front matter without planValidation yields INSUFFICIENT_SPEC", () => {
    const md = `---
name: Slice
overview: x
todos: []
isProject: false
---

# Body
`;
    try {
      loadPlanTransitionRules(md);
      expect.fail("expected TruthLayerError");
    } catch (e) {
      expect(e).toBeInstanceOf(TruthLayerError);
      expect((e as TruthLayerError).code).toBe(CLI_OPERATIONAL_CODES.PLAN_VALIDATION_INSUFFICIENT_SPEC);
    }
  });

  it("duplicate Repository transition validation headings yield AMBIGUOUS_BODY_RULES", () => {
    const md = `---
name: x
---
## Repository transition validation
x
## Repository transition validation
y
`;
    try {
      loadPlanTransitionRules(md);
      expect.fail("expected TruthLayerError");
    } catch (e) {
      expect(e).toBeInstanceOf(TruthLayerError);
      expect((e as TruthLayerError).code).toBe(CLI_OPERATIONAL_CODES.PLAN_VALIDATION_AMBIGUOUS_BODY_RULES);
    }
  });

  it("first fence not yaml yields INSUFFICIENT_SPEC", () => {
    const md = `---
name: x
---
## Repository transition validation
\`\`\`json
{}
\`\`\`
`;
    try {
      loadPlanTransitionRules(md);
      expect.fail("expected TruthLayerError");
    } catch (e) {
      expect(e).toBeInstanceOf(TruthLayerError);
      expect((e as TruthLayerError).code).toBe(CLI_OPERATIONAL_CODES.PLAN_VALIDATION_INSUFFICIENT_SPEC);
    }
  });

  it("two yaml fences in section yield AMBIGUOUS_BODY_RULES", () => {
    const md = `---
name: x
---
## Repository transition validation
\`\`\`yaml
schemaVersion: 1
rules: []
\`\`\`
\`\`\`yaml
schemaVersion: 1
rules: []
\`\`\`
`;
    try {
      loadPlanTransitionRules(md);
      expect.fail("expected TruthLayerError");
    } catch (e) {
      expect(e).toBeInstanceOf(TruthLayerError);
      expect((e as TruthLayerError).code).toBe(CLI_OPERATIONAL_CODES.PLAN_VALIDATION_AMBIGUOUS_BODY_RULES);
    }
  });

  it("invalid yaml in body fence yields PLAN_VALIDATION_YAML_INVALID with body prefix", () => {
    const md = `---
name: x
---
## Repository transition validation
\`\`\`yaml
schemaVersion: 1
rules: [oops not closed
\`\`\`
`;
    try {
      loadPlanTransitionRules(md);
      expect.fail("expected TruthLayerError");
    } catch (e) {
      expect(e).toBeInstanceOf(TruthLayerError);
      expect((e as TruthLayerError).code).toBe(CLI_OPERATIONAL_CODES.PLAN_VALIDATION_YAML_INVALID);
      expect((e as TruthLayerError).message).toContain("body Repository transition validation:");
    }
  });

  it("body yaml valid but schema invalid yields SCHEMA_INVALID with body prefix", () => {
    const md = `---
name: x
---
## Repository transition validation
\`\`\`yaml
schemaVersion: 1
rules:
  - id: x
    kind: requireRenameFromTo
    fromPattern: a
    toPattern: b
\`\`\`
`;
    try {
      loadPlanTransitionRules(md);
      expect.fail("expected TruthLayerError");
    } catch (e) {
      expect(e).toBeInstanceOf(TruthLayerError);
      expect((e as TruthLayerError).code).toBe(CLI_OPERATIONAL_CODES.PLAN_VALIDATION_SCHEMA_INVALID);
      expect((e as TruthLayerError).message.startsWith("body Repository transition validation:")).toBe(true);
    }
  });
});

describe("plan-transition CLI", () => {
  const cliJs = path.join(root, "dist", "cli.js");

  it("plan-transition emits WorkflowResult JSON", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-cli-"));
    execFileSync("git", ["init", dir], { windowsHide: true });
    execFileSync("git", ["-C", dir, "config", "user.email", "c@test"], { windowsHide: true });
    execFileSync("git", ["-C", dir, "config", "user.name", "c"], { windowsHide: true });
    writeFileSync(path.join(dir, "f.txt"), "1");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "a"], { windowsHide: true });
    const b = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    writeFileSync(path.join(dir, "f.txt"), "2");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "b"], { windowsHide: true });
    const a = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();

    const plan = `---
planValidation:
  schemaVersion: 1
  rules:
    - id: r1
      kind: forbidMatchingRows
      pattern: "nonexistent.zzz"
---
`;
    const planPath = path.join(dir, "Plan.md");
    writeFileSync(planPath, plan, "utf8");

    const out = execFileSync(
      process.execPath,
      [cliJs, "plan-transition", "--repo", dir, "--before", b, "--after", a, "--plan", planPath, "--no-truth-report"],
      { encoding: "utf8", windowsHide: true },
    );
    const wf = JSON.parse(out.trim()) as { status: string; workflowId: string };
    expect(wf.workflowId).toBe(PLAN_TRANSITION_WORKFLOW_ID);
    expect(wf.status).toBe("complete");
  }, 20_000);

  it("plan-transition --write-run-bundle writes three artifacts", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-bundle-"));
    execFileSync("git", ["init", dir], { windowsHide: true });
    execFileSync("git", ["-C", dir, "config", "user.email", "c@test"], { windowsHide: true });
    execFileSync("git", ["-C", dir, "config", "user.name", "c"], { windowsHide: true });
    writeFileSync(path.join(dir, "f.txt"), "1");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "a"], { windowsHide: true });
    const b = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    writeFileSync(path.join(dir, "f.txt"), "2");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "b"], { windowsHide: true });
    const a = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();

    const plan = `---
planValidation:
  schemaVersion: 1
  rules:
    - id: noop
      kind: forbidMatchingRows
      pattern: "__no_such_path_plan_bundle__.txt"
---
`;
    const planPath = path.join(dir, "Plan.md");
    writeFileSync(planPath, plan, "utf8");

    const bundleDir = path.join(dir, "bundle-out");
    mkdirSync(bundleDir, { recursive: true });
    execFileSync(
      process.execPath,
      [
        cliJs,
        "plan-transition",
        "--repo",
        dir,
        "--before",
        b,
        "--after",
        a,
        "--plan",
        planPath,
        "--no-truth-report",
        "--write-run-bundle",
        bundleDir,
      ],
      { encoding: "utf8", windowsHide: true },
    );

    const ev = readFileSync(path.join(bundleDir, "events.ndjson"), "utf8");
    const v = loadSchemaValidator("event");
    const evLine = JSON.parse(ev.trim()) as { params: { transitionRulesSource?: string } };
    expect(v(evLine)).toBe(true);
    expect(evLine.params.transitionRulesSource).toBe("front_matter");
    const ar = JSON.parse(readFileSync(path.join(bundleDir, "agent-run.json"), "utf8"));
    const vAr = loadSchemaValidator("agent-run-record");
    expect(vAr(ar)).toBe(true);
  }, 20_000);

  it("plan-transition --write-run-bundle sets transitionRulesSource body_section for body rules", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-bundle-body-"));
    execFileSync("git", ["init", dir], { windowsHide: true });
    execFileSync("git", ["-C", dir, "config", "user.email", "c@test"], { windowsHide: true });
    execFileSync("git", ["-C", dir, "config", "user.name", "c"], { windowsHide: true });
    writeFileSync(path.join(dir, "f.txt"), "1");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "a"], { windowsHide: true });
    const b = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    writeFileSync(path.join(dir, "f.txt"), "2");
    execFileSync("git", ["-C", dir, "add", "."], { windowsHide: true });
    execFileSync("git", ["-C", dir, "commit", "-m", "b"], { windowsHide: true });
    const a = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();

    const plan = `---
name: p
---
## Repository transition validation
\`\`\`yaml
schemaVersion: 1
rules:
  - id: noop
    kind: forbidMatchingRows
    pattern: "__no_such_path_plan_bundle_body__.txt"
\`\`\`
`;
    const planPath = path.join(dir, "Plan.md");
    writeFileSync(planPath, plan, "utf8");

    const bundleDir = path.join(dir, "bundle-out");
    mkdirSync(bundleDir, { recursive: true });
    execFileSync(
      process.execPath,
      [
        cliJs,
        "plan-transition",
        "--repo",
        dir,
        "--before",
        b,
        "--after",
        a,
        "--plan",
        planPath,
        "--no-truth-report",
        "--write-run-bundle",
        bundleDir,
      ],
      { encoding: "utf8", windowsHide: true },
    );

    const evLine = JSON.parse(readFileSync(path.join(bundleDir, "events.ndjson"), "utf8").trim()) as {
      params: { transitionRulesSource?: string };
    };
    expect(loadSchemaValidator("event")(evLine)).toBe(true);
    expect(evLine.params.transitionRulesSource).toBe("body_section");
  }, 20_000);
});
