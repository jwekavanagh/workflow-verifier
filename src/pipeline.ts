import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "fs";
import { aggregateWorkflow } from "./aggregate.js";
import { loadEventsForWorkflow } from "./loadEvents.js";
import { planLogicalSteps, type LogicalStepPlan } from "./planLogicalSteps.js";
import { rollupMultiEffectsAsync, rollupMultiEffectsSync } from "./multiEffectRollup.js";
import { reconcileSqlRow, reconcileSqlRowAsync } from "./reconciler.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import {
  buildRegistryMap,
  renderIntendedEffect,
  resolveVerificationRequest,
} from "./resolveExpectation.js";
import {
  connectPostgresVerificationClient,
  createPostgresSqlReadBackend,
  type SqlReadBackend,
} from "./sqlReadBackend.js";
import type {
  Reason,
  StepOutcome,
  ToolObservedEvent,
  ToolRegistryEntry,
  VerificationDatabase,
  WorkflowResult,
} from "./types.js";
import { CLI_OPERATIONAL_CODES, runLevelIssue } from "./failureCatalog.js";
import { TruthLayerError } from "./truthLayerError.js";
import { formatWorkflowTruthReport } from "./workflowTruthReport.js";

const validateRegistry = loadSchemaValidator("tools-registry");

function defaultTruthReportToStderr(report: string): void {
  process.stderr.write(`${report}\n`);
}
const validateEvent = loadSchemaValidator("event");

export function loadToolsRegistry(registryPath: string): Map<string, ToolRegistryEntry> {
  let raw: string;
  try {
    raw = readFileSync(registryPath, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new TruthLayerError(CLI_OPERATIONAL_CODES.REGISTRY_READ_FAILED, msg, { cause: e });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new TruthLayerError(CLI_OPERATIONAL_CODES.REGISTRY_JSON_SYNTAX, msg, { cause: e });
  }
  if (!validateRegistry(parsed)) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.REGISTRY_SCHEMA_INVALID,
      JSON.stringify(validateRegistry.errors ?? []),
    );
  }
  return buildRegistryMap(parsed as ToolRegistryEntry[]);
}

function buildDivergentStepOutcome(
  plan: LogicalStepPlan,
  registry: Map<string, ToolRegistryEntry>,
): StepOutcome {
  const last = plan.last;
  const n = plan.repeatObservationCount;
  const entry = registry.get(last.toolId);
  const intendedEffect = entry
    ? renderIntendedEffect(entry.effectDescriptionTemplate, last.params)
    : `Unknown tool: ${last.toolId}`;
  return {
    seq: plan.seq,
    toolId: last.toolId,
    intendedEffect,
    verificationRequest: null,
    status: "incomplete_verification",
    reasons: [
      {
        code: "RETRY_OBSERVATIONS_DIVERGE",
        message:
          "Multiple observations for this seq do not all match the last observation (toolId and canonical params).",
      },
    ],
    evidenceSummary: {},
    repeatObservationCount: n,
    evaluatedObservationOrdinal: n,
  };
}

export function verifyToolObservedStep(options: {
  workflowId: string;
  ev: ToolObservedEvent;
  registry: Map<string, ToolRegistryEntry>;
  db: DatabaseSync;
  logStep: (line: object) => void;
  repeatObservationCount?: number;
}): StepOutcome {
  const { workflowId, ev, registry, db, logStep } = options;
  const repeatObservationCount = options.repeatObservationCount ?? 1;
  const evaluatedObservationOrdinal = repeatObservationCount;
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
      repeatObservationCount,
      evaluatedObservationOrdinal,
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
      repeatObservationCount,
      evaluatedObservationOrdinal,
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
      repeatObservationCount,
      evaluatedObservationOrdinal,
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
      repeatObservationCount,
      evaluatedObservationOrdinal,
    });
    return outcome;
  }

  if (resolved.verificationKind === "sql_effects") {
    const rolled = rollupMultiEffectsSync(db, resolved.effects);
    const outcome: StepOutcome = {
      seq: ev.seq,
      toolId: ev.toolId,
      intendedEffect,
      verificationRequest: rolled.verificationRequest,
      status: rolled.status,
      reasons: rolled.reasons,
      evidenceSummary: rolled.evidenceSummary,
      repeatObservationCount,
      evaluatedObservationOrdinal,
    };
    logStep({
      workflowId,
      seq: ev.seq,
      toolId: ev.toolId,
      intendedEffect,
      verificationRequest: rolled.verificationRequest,
      status: outcome.status,
      reasons: outcome.reasons,
      evidenceSummary: outcome.evidenceSummary,
      repeatObservationCount,
      evaluatedObservationOrdinal,
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
    repeatObservationCount,
    evaluatedObservationOrdinal,
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
    repeatObservationCount,
    evaluatedObservationOrdinal,
  });
  return outcome;
}

async function verifyToolObservedStepAsync(options: {
  workflowId: string;
  ev: ToolObservedEvent;
  registry: Map<string, ToolRegistryEntry>;
  backend: SqlReadBackend;
  logStep: (line: object) => void;
  repeatObservationCount?: number;
}): Promise<StepOutcome> {
  const { workflowId, ev, registry, backend, logStep } = options;
  const repeatObservationCount = options.repeatObservationCount ?? 1;
  const evaluatedObservationOrdinal = repeatObservationCount;
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
      repeatObservationCount,
      evaluatedObservationOrdinal,
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
      repeatObservationCount,
      evaluatedObservationOrdinal,
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
      repeatObservationCount,
      evaluatedObservationOrdinal,
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
      repeatObservationCount,
      evaluatedObservationOrdinal,
    });
    return outcome;
  }

  if (resolved.verificationKind === "sql_effects") {
    const rolled = await rollupMultiEffectsAsync(backend, resolved.effects);
    const outcome: StepOutcome = {
      seq: ev.seq,
      toolId: ev.toolId,
      intendedEffect,
      verificationRequest: rolled.verificationRequest,
      status: rolled.status,
      reasons: rolled.reasons,
      evidenceSummary: rolled.evidenceSummary,
      repeatObservationCount,
      evaluatedObservationOrdinal,
    };
    logStep({
      workflowId,
      seq: ev.seq,
      toolId: ev.toolId,
      intendedEffect,
      verificationRequest: rolled.verificationRequest,
      status: outcome.status,
      reasons: outcome.reasons,
      evidenceSummary: outcome.evidenceSummary,
      repeatObservationCount,
      evaluatedObservationOrdinal,
    });
    return outcome;
  }

  const rec = await reconcileSqlRowAsync(backend, resolved.request);
  const outcome: StepOutcome = {
    seq: ev.seq,
    toolId: ev.toolId,
    intendedEffect,
    verificationRequest: resolved.request,
    status: rec.status,
    reasons: rec.reasons,
    evidenceSummary: rec.evidenceSummary,
    repeatObservationCount,
    evaluatedObservationOrdinal,
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
    repeatObservationCount,
    evaluatedObservationOrdinal,
  });
  return outcome;
}

function runLogicalStepsVerificationSync(options: {
  workflowId: string;
  events: ToolObservedEvent[];
  registry: Map<string, ToolRegistryEntry>;
  db: DatabaseSync;
  logStep: (line: object) => void;
}): StepOutcome[] {
  const plans = planLogicalSteps(options.events);
  const out: StepOutcome[] = [];
  for (const plan of plans) {
    const n = plan.repeatObservationCount;
    if (plan.divergent) {
      const outcome = buildDivergentStepOutcome(plan, options.registry);
      options.logStep({
        workflowId: options.workflowId,
        seq: outcome.seq,
        toolId: outcome.toolId,
        intendedEffect: outcome.intendedEffect,
        verificationRequest: null,
        status: outcome.status,
        reasons: outcome.reasons,
        evidenceSummary: outcome.evidenceSummary,
        repeatObservationCount: n,
        evaluatedObservationOrdinal: n,
      });
      out.push(outcome);
      continue;
    }
    out.push(
      verifyToolObservedStep({
        workflowId: options.workflowId,
        ev: plan.last,
        registry: options.registry,
        db: options.db,
        logStep: options.logStep,
        repeatObservationCount: n,
      }),
    );
  }
  return out;
}

async function runLogicalStepsVerificationAsync(options: {
  workflowId: string;
  events: ToolObservedEvent[];
  registry: Map<string, ToolRegistryEntry>;
  backend: SqlReadBackend;
  logStep: (line: object) => void;
}): Promise<StepOutcome[]> {
  const plans = planLogicalSteps(options.events);
  const out: StepOutcome[] = [];
  for (const plan of plans) {
    const n = plan.repeatObservationCount;
    if (plan.divergent) {
      const outcome = buildDivergentStepOutcome(plan, options.registry);
      options.logStep({
        workflowId: options.workflowId,
        seq: outcome.seq,
        toolId: outcome.toolId,
        intendedEffect: outcome.intendedEffect,
        verificationRequest: null,
        status: outcome.status,
        reasons: outcome.reasons,
        evidenceSummary: outcome.evidenceSummary,
        repeatObservationCount: n,
        evaluatedObservationOrdinal: n,
      });
      out.push(outcome);
      continue;
    }
    out.push(
      await verifyToolObservedStepAsync({
        workflowId: options.workflowId,
        ev: plan.last,
        registry: options.registry,
        backend: options.backend,
        logStep: options.logStep,
        repeatObservationCount: n,
      }),
    );
  }
  return out;
}

export async function verifyWorkflow(options: {
  workflowId: string;
  eventsPath: string;
  registryPath: string;
  database: VerificationDatabase;
  logStep?: (line: object) => void;
  truthReport?: (report: string) => void;
}): Promise<WorkflowResult> {
  const { eventsPath, registryPath, workflowId, database } = options;
  const log = options.logStep ?? (() => {});
  const truthReport = options.truthReport ?? defaultTruthReportToStderr;

  const { events, runLevelReasons } = loadEventsForWorkflow(eventsPath, workflowId);
  const registry = loadToolsRegistry(registryPath);

  let steps: StepOutcome[];

  if (database.kind === "sqlite") {
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(database.path, { readOnly: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new TruthLayerError(CLI_OPERATIONAL_CODES.SQLITE_DATABASE_OPEN_FAILED, msg, { cause: e });
    }
    try {
      steps = runLogicalStepsVerificationSync({
        workflowId,
        events,
        registry,
        db,
        logStep: log,
      });
    } finally {
      db.close();
    }
  } else {
    let client: Awaited<ReturnType<typeof connectPostgresVerificationClient>>;
    try {
      client = await connectPostgresVerificationClient(database.connectionString);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new TruthLayerError(CLI_OPERATIONAL_CODES.POSTGRES_CLIENT_SETUP_FAILED, msg, { cause: e });
    }
    const backend = createPostgresSqlReadBackend(client);
    try {
      steps = await runLogicalStepsVerificationAsync({
        workflowId,
        events,
        registry,
        backend,
        logStep: log,
      });
    } finally {
      try {
        await client.end();
      } catch {
        /* cleanup only */
      }
    }
  }

  const result = aggregateWorkflow(workflowId, steps, runLevelReasons);
  truthReport(formatWorkflowTruthReport(result));
  return result;
}

const POST_CLOSE_MSG = "Workflow verification observeStep invoked after workflow run completed";

class WorkflowVerificationSession {
  private readonly workflowId: string;
  private readonly registry: Map<string, ToolRegistryEntry>;
  private readonly db: DatabaseSync;
  private readonly logStep: (line: object) => void;
  private readonly bufferedEvents: ToolObservedEvent[] = [];
  private readonly runLevelReasons: Reason[] = [];
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

  observeStep(value: unknown): undefined {
    if (this.observeForbidden) {
      throw new Error(POST_CLOSE_MSG);
    }
    if (typeof value !== "object" || value === null) {
      this.runLevelReasons.push(runLevelIssue("MALFORMED_EVENT_LINE"));
      return undefined;
    }
    if (!validateEvent(value)) {
      this.runLevelReasons.push(runLevelIssue("MALFORMED_EVENT_LINE"));
      return undefined;
    }
    const ev = value as ToolObservedEvent;
    if (ev.workflowId !== this.workflowId) {
      return undefined;
    }
    this.bufferedEvents.push(ev);
    return undefined;
  }

  closeDbIfOpen(): void {
    if (this.dbOpen) {
      this.db.close();
      this.dbOpen = false;
    }
    this.observeForbidden = true;
  }

  buildWorkflowResult(): WorkflowResult {
    if (!this.dbOpen) {
      throw new Error("Workflow verification buildWorkflowResult invoked after database closed");
    }
    const steps = runLogicalStepsVerificationSync({
      workflowId: this.workflowId,
      events: this.bufferedEvents,
      registry: this.registry,
      db: this.db,
      logStep: this.logStep,
    });
    return aggregateWorkflow(this.workflowId, steps, [...this.runLevelReasons]);
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
  run: (observeStep: (value: unknown) => void) => void | Promise<void>,
): Promise<WorkflowResult> {
  const log = options.logStep ?? (() => {});
  const truthReport = options.truthReport ?? defaultTruthReportToStderr;
  let session: WorkflowVerificationSession | undefined;
  let runFailure: unknown;
  let result: WorkflowResult | undefined;
  try {
    const registry = loadToolsRegistry(options.registryPath);
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(options.dbPath, { readOnly: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new TruthLayerError(CLI_OPERATIONAL_CODES.SQLITE_DATABASE_OPEN_FAILED, msg, { cause: e });
    }
    session = new WorkflowVerificationSession(options.workflowId, registry, db, log);
    await Promise.resolve(run((v) => session!.observeStep(v)));
    result = session.buildWorkflowResult();
  } catch (e) {
    runFailure = e;
  } finally {
    session?.closeDbIfOpen();
  }
  if (runFailure !== undefined) {
    throw runFailure;
  }
  truthReport(formatWorkflowTruthReport(result!));
  return result!;
}
