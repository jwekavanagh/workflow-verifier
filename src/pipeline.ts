import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "fs";
import { aggregateWorkflow } from "./aggregate.js";
import { loadEventsForWorkflow } from "./loadEvents.js";
import { reconcileSqlRow } from "./reconciler.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import {
  buildRegistryMap,
  renderIntendedEffect,
  resolveVerificationRequest,
} from "./resolveExpectation.js";
import type { StepOutcome, ToolObservedEvent, ToolRegistryEntry, WorkflowResult } from "./types.js";
import { formatWorkflowTruthReport } from "./workflowTruthReport.js";

const validateRegistry = loadSchemaValidator("tools-registry");

function defaultTruthReportToStderr(report: string): void {
  process.stderr.write(`${report}\n`);
}
const validateEvent = loadSchemaValidator("event");

export function loadToolsRegistry(registryPath: string): Map<string, ToolRegistryEntry> {
  const raw = readFileSync(registryPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!validateRegistry(parsed)) {
    throw new Error(`Invalid tools registry: ${JSON.stringify(validateRegistry.errors ?? [])}`);
  }
  return buildRegistryMap(parsed as ToolRegistryEntry[]);
}

export function verifyToolObservedStep(options: {
  workflowId: string;
  ev: ToolObservedEvent;
  registry: Map<string, ToolRegistryEntry>;
  db: DatabaseSync;
  logStep: (line: object) => void;
}): StepOutcome {
  const { workflowId, ev, registry, db, logStep } = options;
  const entry = registry.get(ev.toolId);
  if (!entry) {
    const outcome: StepOutcome = {
      seq: ev.seq,
      toolId: ev.toolId,
      intendedEffect: `Unknown tool: ${ev.toolId}`,
      verificationRequest: null,
      status: "incomplete_verification",
      reasons: [{ code: "UNKNOWN_TOOL", message: `Unknown toolId: ${ev.toolId}` }],
      evidenceSummary: {},
    };
    logStep({
      workflowId,
      seq: ev.seq,
      toolId: ev.toolId,
      intendedEffect: outcome.intendedEffect,
      verificationRequest: null,
      status: outcome.status,
      reasons: outcome.reasons,
      evidenceSummary: outcome.evidenceSummary,
    });
    return outcome;
  }

  const intendedEffect = renderIntendedEffect(entry.effectDescriptionTemplate, ev.params);
  const resolved = resolveVerificationRequest(entry, ev.params);
  if (!resolved.ok) {
    const outcome: StepOutcome = {
      seq: ev.seq,
      toolId: ev.toolId,
      intendedEffect,
      verificationRequest: null,
      status: "incomplete_verification",
      reasons: [{ code: resolved.code, message: resolved.message }],
      evidenceSummary: {},
    };
    logStep({
      workflowId,
      seq: ev.seq,
      toolId: ev.toolId,
      intendedEffect,
      verificationRequest: null,
      status: outcome.status,
      reasons: outcome.reasons,
      evidenceSummary: outcome.evidenceSummary,
    });
    return outcome;
  }

  const rec = reconcileSqlRow(db, resolved.request);
  const outcome: StepOutcome = {
    seq: ev.seq,
    toolId: ev.toolId,
    intendedEffect,
    verificationRequest: resolved.request,
    status: rec.status,
    reasons: rec.reasons,
    evidenceSummary: rec.evidenceSummary,
  };
  logStep({
    workflowId,
    seq: ev.seq,
    toolId: ev.toolId,
    intendedEffect,
    verificationRequest: resolved.request,
    status: outcome.status,
    reasons: outcome.reasons,
    evidenceSummary: outcome.evidenceSummary,
  });
  return outcome;
}

export function verifyWorkflow(options: {
  workflowId: string;
  eventsPath: string;
  registryPath: string;
  dbPath: string;
  logStep?: (line: object) => void;
  truthReport?: (report: string) => void;
}): WorkflowResult {
  const { eventsPath, registryPath, dbPath, workflowId } = options;
  const log = options.logStep ?? (() => {});
  const truthReport = options.truthReport ?? defaultTruthReportToStderr;

  const { events, runLevelCodes } = loadEventsForWorkflow(eventsPath, workflowId);
  const registry = loadToolsRegistry(registryPath);
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const steps: StepOutcome[] = [];

  try {
    for (const ev of events) {
      steps.push(verifyToolObservedStep({ workflowId, ev, registry, db, logStep: log }));
    }
  } finally {
    db.close();
  }

  const result = aggregateWorkflow(workflowId, steps, runLevelCodes);
  truthReport(formatWorkflowTruthReport(result));
  return result;
}

const POST_CLOSE_MSG = "Workflow verification observeStep invoked after workflow run completed";

class WorkflowVerificationSession {
  private readonly workflowId: string;
  private readonly registry: Map<string, ToolRegistryEntry>;
  private readonly db: DatabaseSync;
  private readonly logStep: (line: object) => void;
  private readonly steps: StepOutcome[] = [];
  private readonly runLevelCodes: string[] = [];
  private observeForbidden = false;
  private dbOpen = true;

  constructor(
    workflowId: string,
    registry: Map<string, ToolRegistryEntry>,
    db: DatabaseSync,
    logStep: (line: object) => void,
  ) {
    this.workflowId = workflowId;
    this.registry = registry;
    this.db = db;
    this.logStep = logStep;
  }

  observeStep(value: unknown): StepOutcome | undefined {
    if (this.observeForbidden) {
      throw new Error(POST_CLOSE_MSG);
    }
    if (typeof value !== "object" || value === null) {
      this.runLevelCodes.push("MALFORMED_EVENT_LINE");
      return undefined;
    }
    if (!validateEvent(value)) {
      this.runLevelCodes.push("MALFORMED_EVENT_LINE");
      return undefined;
    }
    const ev = value as ToolObservedEvent;
    if (ev.workflowId !== this.workflowId) {
      return undefined;
    }
    const outcome = verifyToolObservedStep({
      workflowId: this.workflowId,
      ev,
      registry: this.registry,
      db: this.db,
      logStep: this.logStep,
    });
    this.steps.push(outcome);
    return outcome;
  }

  closeDbIfOpen(): void {
    if (this.dbOpen) {
      this.db.close();
      this.dbOpen = false;
    }
    this.observeForbidden = true;
  }

  buildWorkflowResult(): WorkflowResult {
    const sorted = [...this.steps].sort((a, b) => a.seq - b.seq);
    const codes = [...this.runLevelCodes];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.seq === sorted[i - 1]!.seq) {
        if (!codes.includes("DUPLICATE_SEQ")) {
          codes.push("DUPLICATE_SEQ");
        }
        break;
      }
    }
    return aggregateWorkflow(this.workflowId, sorted, codes);
  }
}

export async function withWorkflowVerification(
  options: {
    workflowId: string;
    registryPath: string;
    dbPath: string;
    logStep?: (line: object) => void;
    truthReport?: (report: string) => void;
  },
  run: (observeStep: (value: unknown) => StepOutcome | undefined) => void | Promise<void>,
): Promise<WorkflowResult> {
  const log = options.logStep ?? (() => {});
  const truthReport = options.truthReport ?? defaultTruthReportToStderr;
  let session: WorkflowVerificationSession | undefined;
  let runFailure: unknown;
  try {
    const registry = loadToolsRegistry(options.registryPath);
    const db = new DatabaseSync(options.dbPath, { readOnly: true });
    session = new WorkflowVerificationSession(options.workflowId, registry, db, log);
    await Promise.resolve(run((v) => session!.observeStep(v)));
  } catch (e) {
    runFailure = e;
  } finally {
    session?.closeDbIfOpen();
  }
  if (runFailure !== undefined) {
    throw runFailure;
  }
  const result = session!.buildWorkflowResult();
  truthReport(formatWorkflowTruthReport(result));
  return result;
}
