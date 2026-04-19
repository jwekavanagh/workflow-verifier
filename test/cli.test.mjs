import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {
  CLI_OPERATIONAL_CODES,
  RETRY_OBSERVATIONS_DIVERGE_MESSAGE,
} from "../dist/failureCatalog.js";
import { formatWorkflowTruthReport } from "../dist/workflowTruthReport.js";
import { formatDistributionFooter } from "../dist/distributionFooter.js";
import { loadSchemaValidator } from "../dist/schemaLoad.js";
import { loadCorpusRun, resolveCorpusRootReal } from "../dist/debugCorpus.js";
import { loadEventsForWorkflow } from "../dist/loadEvents.js";
import { formatNoStepsForWorkflowMessage } from "../dist/noStepsMessage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliJs = join(root, "dist", "cli.js");

describe("CLI agentskeptic", () => {
  let dir;
  let dbPath;
  /** Preserve env: golden stderr assertions exclude optional OSS claim lines. */
  let prevOssClaimStderr;

  before(() => {
    prevOssClaimStderr = process.env.AGENTSKEPTIC_OSS_CLAIM_STDERR;
    process.env.AGENTSKEPTIC_OSS_CLAIM_STDERR = "0";
    dir = mkdtempSync(join(tmpdir(), "etl-cli-"));
    dbPath = join(dir, "test.db");
    const sql = readFileSync(join(root, "examples", "seed.sql"), "utf8");
    const db = new DatabaseSync(dbPath);
    db.exec(sql);
    db.close();
  });

  after(() => {
    if (prevOssClaimStderr === undefined) delete process.env.AGENTSKEPTIC_OSS_CLAIM_STDERR;
    else process.env.AGENTSKEPTIC_OSS_CLAIM_STDERR = prevOssClaimStderr;
    rmSync(dir, { recursive: true, force: true });
  });

  const eventsPath = join(root, "examples", "events.ndjson");
  const registryPath = join(root, "examples", "tools.json");

  it("stderr report then stdout JSON; stderr equals formatWorkflowTruthReport(stdout)", () => {
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "--workflow-id",
        "wf_complete",
        "--events",
        eventsPath,
        "--registry",
        registryPath,
        "--db",
        dbPath,
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 0, r.stderr);
    const stdout = r.stdout.trimEnd();
    const stderr = r.stderr.replace(/\r\n/g, "\n").replace(/\n$/, "");
    const parsed = JSON.parse(stdout);
    const validateResult = loadSchemaValidator("workflow-result");
    assert.equal(validateResult(parsed), true);
    const expected = (
      formatWorkflowTruthReport(parsed).replace(/\r\n/g, "\n") +
      "\n" +
      formatDistributionFooter()
    ).replace(/\n$/, "");
    assert.equal(stderr, expected);
  });

  it("--no-truth-report: stderr empty; stdout schema-valid wf_complete", () => {
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "--workflow-id",
        "wf_complete",
        "--events",
        eventsPath,
        "--registry",
        registryPath,
        "--db",
        dbPath,
        "--no-truth-report",
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
    const parsed = JSON.parse(r.stdout.trim());
    const validateResult = loadSchemaValidator("workflow-result");
    assert.equal(validateResult(parsed), true);
    assert.equal(parsed.workflowId, "wf_complete");
    assert.equal(parsed.status, "complete");
    assert.equal(parsed.steps[0]?.status, "verified");
  });

  it("--share-report-origin to closed port: exit 3, stdout empty, stderr one JSON line SHARE_REPORT_FAILED", () => {
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "--workflow-id",
        "wf_complete",
        "--events",
        eventsPath,
        "--registry",
        registryPath,
        "--db",
        dbPath,
        "--share-report-origin",
        "https://127.0.0.1:9",
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 3, r.stderr);
    assert.equal(r.stdout, "");
    const lines = r.stderr.replace(/\r\n/g, "\n").trimEnd().split("\n");
    assert.equal(lines.length, 1);
    const j = JSON.parse(lines[0]);
    assert.equal(j.code, CLI_OPERATIONAL_CODES.SHARE_REPORT_FAILED);
    assert.ok(String(j.message).includes("share_report_origin="));
  });

  it("--write-run-bundle writes a loadable canonical bundle", () => {
    const bundleDir = mkdtempSync(join(tmpdir(), "etl-bundle-"));
    try {
      const r = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          cliJs,
          "--workflow-id",
          "wf_complete",
          "--events",
          eventsPath,
          "--registry",
          registryPath,
          "--db",
          dbPath,
          "--no-truth-report",
          "--write-run-bundle",
          bundleDir,
        ],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 0, r.stderr);
      const corpusRootReal = resolveCorpusRootReal(dirname(bundleDir));
      const outcome = loadCorpusRun(corpusRootReal, basename(bundleDir));
      assert.equal(outcome.loadStatus, "ok");
      if (outcome.loadStatus === "ok") {
        assert.equal(outcome.workflowResult.workflowId, "wf_complete");
        assert.equal(outcome.agentRunRecord.workflowId, "wf_complete");
      }
    } finally {
      rmSync(bundleDir, { recursive: true, force: true });
    }
  });

  it("--help exits 0 and prints usage to stdout", () => {
    const r = spawnSync(process.execPath, ["--no-warnings", cliJs, "--help"], {
      encoding: "utf8",
      cwd: root,
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("Usage:"));
    assert.equal(r.stderr.trim(), "");
  });

  it("verify-integrator-owned --help exits 0", () => {
    const r = spawnSync(process.execPath, ["--no-warnings", cliJs, "verify-integrator-owned", "--help"], {
      encoding: "utf8",
      cwd: root,
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("verify-integrator-owned"));
    assert.equal(r.stderr.trim(), "");
  });

  it("verify-integrator-owned rejects bundled example triple with exit 2", () => {
    const demoDb = join(root, "examples", "demo.db");
    const r = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        cliJs,
        "verify-integrator-owned",
        "--workflow-id",
        "wf_complete",
        "--events",
        eventsPath,
        "--registry",
        registryPath,
        "--db",
        demoDb,
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(r.status, 2, r.stderr);
    assert.ok(r.stderr.includes("INTEGRATOR_OWNED_GATE"), r.stderr);
    assert.ok(r.stderr.includes("bundled_examples"), r.stderr);
    assert.equal(r.stdout.trim(), "");
  });

  it("verify-integrator-owned stdout matches batch verify for non-bundled db path", () => {
    const argsBatch = [
      "--no-warnings",
      cliJs,
      "--workflow-id",
      "wf_complete",
      "--events",
      eventsPath,
      "--registry",
      registryPath,
      "--db",
      dbPath,
    ];
    const argsIo = ["--no-warnings", cliJs, "verify-integrator-owned", ...argsBatch.slice(2)];
    const rBatch = spawnSync(process.execPath, argsBatch, { encoding: "utf8", cwd: root });
    const rIo = spawnSync(process.execPath, argsIo, { encoding: "utf8", cwd: root });
    assert.equal(rBatch.status, 0, rBatch.stderr);
    assert.equal(rIo.status, 0, rIo.stderr);
    assert.equal(rIo.stdout.trim(), rBatch.stdout.trim());
  });

  it("missing args → exit 3 and stderr JSON CLI_USAGE", () => {
    const r = spawnSync(process.execPath, ["--no-warnings", cliJs, "--workflow-id", "w"], {
      encoding: "utf8",
      cwd: root,
    });
    assert.equal(r.status, 3);
    assert.equal(r.stdout.trim(), "");
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.kind, "execution_truth_layer_error");
    assert.equal(err.schemaVersion, 2);
    assert.equal(err.code, "CLI_USAGE");
    assert.ok(err.message.length > 0);
    assert.ok(err.message.length <= 2048);
    assert.equal(err.failureDiagnosis.primaryOrigin, "inputs");
    assert.equal(err.failureDiagnosis.confidence, "high");
    assert.equal(err.failureDiagnosis.evidence[0].referenceCode, "CLI_USAGE");
  });

  it("eventual without window/poll → exit 3 CLI_USAGE", () => {
    const r = spawnSync(process.execPath, [
      "--no-warnings",
      cliJs,
      "--workflow-id",
      "wf_complete",
      "--events",
      eventsPath,
      "--registry",
      registryPath,
      "--db",
      dbPath,
      "--consistency",
      "eventual",
    ], { encoding: "utf8", cwd: root });
    assert.equal(r.status, 3);
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.code, CLI_OPERATIONAL_CODES.CLI_USAGE);
  });

  it("eventual with poll > window → exit 3 VERIFICATION_POLICY_INVALID", () => {
    const r = spawnSync(process.execPath, [
      "--no-warnings",
      cliJs,
      "--workflow-id",
      "wf_complete",
      "--events",
      eventsPath,
      "--registry",
      registryPath,
      "--db",
      dbPath,
      "--consistency",
      "eventual",
      "--verification-window-ms",
      "10",
      "--poll-interval-ms",
      "50",
    ], { encoding: "utf8", cwd: root });
    assert.equal(r.status, 3);
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.code, CLI_OPERATIONAL_CODES.VERIFICATION_POLICY_INVALID);
  });

  it("strong with window flag → exit 3 CLI_USAGE", () => {
    const r = spawnSync(process.execPath, [
      "--no-warnings",
      cliJs,
      "--workflow-id",
      "wf_complete",
      "--events",
      eventsPath,
      "--registry",
      registryPath,
      "--db",
      dbPath,
      "--verification-window-ms",
      "100",
    ], { encoding: "utf8", cwd: root });
    assert.equal(r.status, 3);
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.code, CLI_OPERATIONAL_CODES.CLI_USAGE);
  });

  it("wf_missing exit 1 and inconsistent trust line", () => {
    const r = spawnSync(process.execPath, [
      "--no-warnings",
      cliJs,
      "--workflow-id",
      "wf_missing",
      "--events",
      eventsPath,
      "--registry",
      registryPath,
      "--db",
      dbPath,
    ], { encoding: "utf8", cwd: root });
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.status, "inconsistent");
    const errText = r.stderr.replace(/\r\n/g, "\n");
    assert.ok(
      errText.includes(
        "trust: NOT TRUSTED: At least one step failed verification against the database (determinate failure).",
      ),
    );
  });

  describe("validate-registry subcommand", () => {
    const validateRv = loadSchemaValidator("registry-validation-result");

    it("valid registry, no events → exit 0; stdout valid; stderr empty", () => {
      const r = spawnSync(
        process.execPath,
        ["--no-warnings", cliJs, "validate-registry", "--registry", registryPath],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, "");
      const out = JSON.parse(r.stdout.trim());
      assert.equal(validateRv(out), true);
      assert.equal(out.valid, true);
      assert.deepEqual(out.structuralIssues, []);
      assert.deepEqual(out.resolutionIssues, []);
      assert.equal(out.eventLoad, undefined);
    });

    it("valid registry + events wf_complete → exit 0; eventLoad present", () => {
      const r = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          cliJs,
          "validate-registry",
          "--registry",
          registryPath,
          "--events",
          eventsPath,
          "--workflow-id",
          "wf_complete",
        ],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, "");
      const out = JSON.parse(r.stdout.trim());
      assert.equal(validateRv(out), true);
      assert.equal(out.valid, true);
      assert.equal(out.eventLoad.workflowId, "wf_complete");
      assert.equal(typeof out.eventLoad.malformedEventLineCount, "number");
    });

    it("invalid registry [] → exit 1; stderr human header; stdout valid false", () => {
      const badPath = join(dir, "bad-reg.json");
      writeFileSync(badPath, "[]");
      const r2 = spawnSync(
        process.execPath,
        ["--no-warnings", cliJs, "validate-registry", "--registry", badPath],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r2.status, 1, r2.stderr);
      const errText = r2.stderr.replace(/\r\n/g, "\n");
      assert.ok(errText.startsWith("Registry validation failed:\n"));
      assert.ok(errText.includes("- structural (json_schema):"));
      const out = JSON.parse(r2.stdout.trim());
      assert.equal(validateRv(out), true);
      assert.equal(out.valid, false);
      assert.ok(out.structuralIssues.length > 0);
    });

    it("duplicate toolId → exit 1; duplicate_tool_id in stdout", () => {
      const one = JSON.parse(readFileSync(registryPath, "utf8"))[0];
      const dupPath = join(dir, "dup-tools.json");
      writeFileSync(dupPath, JSON.stringify([one, one]));
      const r = spawnSync(
        process.execPath,
        ["--no-warnings", cliJs, "validate-registry", "--registry", dupPath],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 1);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.valid, false);
      assert.ok(out.structuralIssues.some((s) => s.kind === "duplicate_tool_id"));
    });

    it("resolver failure → exit 1; resolution line in stderr", () => {
      const r = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          cliJs,
          "validate-registry",
          "--registry",
          registryPath,
          "--events",
          eventsPath,
          "--workflow-id",
          "wf_unknown_tool",
        ],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 1);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.valid, false);
      assert.ok(out.resolutionIssues.some((i) => i.code === "UNKNOWN_TOOL"));
      assert.ok(r.stderr.includes("UNKNOWN_TOOL"));
    });

    it("zero steps → exit 1; NO_STEPS_FOR_WORKFLOW", () => {
      const r = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          cliJs,
          "validate-registry",
          "--registry",
          registryPath,
          "--events",
          eventsPath,
          "--workflow-id",
          "wf___none___",
        ],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 1);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.resolutionIssues.length, 1);
      assert.equal(out.resolutionIssues[0].code, "NO_STEPS_FOR_WORKFLOW");
      assert.equal(out.resolutionIssues[0].seq, null);
      assert.equal(out.resolutionIssues[0].toolId, null);
      const { eventFileAggregateCounts } = loadEventsForWorkflow(eventsPath, "wf___none___");
      assert.equal(
        out.resolutionIssues[0].message,
        formatNoStepsForWorkflowMessage("wf___none___", eventFileAggregateCounts),
      );
    });

    it("divergent-only workflow → exit 0; resolutionSkipped populated", () => {
      const r = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          cliJs,
          "validate-registry",
          "--registry",
          registryPath,
          "--events",
          eventsPath,
          "--workflow-id",
          "wf_divergent_retry",
        ],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.valid, true);
      assert.equal(out.resolutionSkipped.length, 1);
      assert.equal(out.resolutionSkipped[0].message, RETRY_OBSERVATIONS_DIVERGE_MESSAGE);
    });

    it("--events without --workflow-id → exit 3 VALIDATE_REGISTRY_USAGE; stdout empty", () => {
      const r = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          cliJs,
          "validate-registry",
          "--registry",
          registryPath,
          "--events",
          eventsPath,
        ],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 3);
      assert.equal(r.stdout.trim(), "");
      const err = JSON.parse(r.stderr.trim());
      assert.equal(err.code, "VALIDATE_REGISTRY_USAGE");
    });

    it("unknown option → exit 3 VALIDATE_REGISTRY_USAGE", () => {
      const r = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          cliJs,
          "validate-registry",
          "--registry",
          registryPath,
          "--db",
          "x",
        ],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 3);
      assert.equal(r.stdout.trim(), "");
      const err = JSON.parse(r.stderr.trim());
      assert.equal(err.code, "VALIDATE_REGISTRY_USAGE");
    });

    it("missing --registry → exit 3", () => {
      const r = spawnSync(process.execPath, ["--no-warnings", cliJs, "validate-registry"], {
        encoding: "utf8",
        cwd: root,
      });
      assert.equal(r.status, 3);
      const err = JSON.parse(r.stderr.trim());
      assert.equal(err.code, "VALIDATE_REGISTRY_USAGE");
    });

    it("unreadable registry → exit 3 REGISTRY_READ_FAILED", () => {
      const r = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          cliJs,
          "validate-registry",
          "--registry",
          join(dir, "does-not-exist-tools.json"),
        ],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 3);
      assert.equal(r.stdout.trim(), "");
      const err = JSON.parse(r.stderr.trim());
      assert.equal(err.code, "REGISTRY_READ_FAILED");
    });
  });

  describe("execution-trace subcommand", () => {
    const traceEventsPath = join(root, "examples", "trace-run.ndjson");

    it("emits valid ExecutionTraceView JSON; stderr empty", () => {
      const r = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          cliJs,
          "execution-trace",
          "--workflow-id",
          "wtrace",
          "--events",
          traceEventsPath,
        ],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, "");
      const view = JSON.parse(r.stdout.trim());
      const v = loadSchemaValidator("execution-trace-view");
      assert.equal(v(view), true);
    });

    it("duplicate runEventId → exit 3 TRACE_DUPLICATE_RUN_EVENT_ID; stdout empty", () => {
      const bad = join(dir, "dup-trace.ndjson");
      writeFileSync(
        bad,
        '{"schemaVersion":2,"workflowId":"wdup","runEventId":"x","type":"model_turn","status":"completed"}\n' +
          '{"schemaVersion":2,"workflowId":"wdup","runEventId":"x","type":"model_turn","status":"completed"}\n',
      );
      const r = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          cliJs,
          "execution-trace",
          "--workflow-id",
          "wdup",
          "--events",
          bad,
        ],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(r.status, 3);
      assert.equal(r.stdout.trim(), "");
      const err = JSON.parse(r.stderr.trim());
      assert.equal(err.code, CLI_OPERATIONAL_CODES.TRACE_DUPLICATE_RUN_EVENT_ID);
    });
  });
});
