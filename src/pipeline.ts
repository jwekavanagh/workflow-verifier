import { DatabaseSync } from "node:sqlite";
import { aggregateWorkflow } from "./aggregate.js";
import { isToolObservedRunEvent } from "./executionTrace.js";
import { loadEventsForWorkflow } from "./loadEvents.js";
import { prepareWorkflowEvents } from "./prepareWorkflowEvents.js";
import { canonicalJsonForParams } from "./canonicalParams.js";
import { planLogicalSteps, type LogicalStepPlan } from "./planLogicalSteps.js";
import { reconcileRelationalPostgres } from "./relationalInvariant.js";
import { reconcileSqlRowAsync } from "./reconciler.js";
import { loadSchemaValidator } from "./schemaLoad.js";
import {
  buildRegistryMap,
  renderIntendedEffect,
  resolveVerificationRequest,
} from "./resolveExpectation.js";
import { loadRegistryEntriesAfterSchema } from "./toolsRegistryLoad.js";
import {
  connectPostgresVerificationClient,
  createPostgresSqlReadBackend,
  type SqlReadBackend,
} from "./sqlReadBackend.js";
import type {
  IntendedEffect,
  ObservedExecution,
  Reason,
  StepOutcome,
  RunEvent,
  ToolObservedEvent,
  ToolRegistryEntry,
  VerificationDatabase,
  VerificationPolicy,
  WorkflowEngineResult,
  WorkflowResult,
} from "./types.js";
import {
  CLI_OPERATIONAL_CODES,
  RETRY_OBSERVATIONS_DIVERGE_MESSAGE,
  runLevelIssue,
} from "./failureCatalog.js";
import { TruthLayerError } from "./truthLayerError.js";
import { writeAgentRunBundle } from "./agentRunBundle.js";
import {
  finalizeEmittedWorkflowResult,
  formatWorkflowTruthReport,
} from "./workflowTruthReport.js";
import {
  createSqlitePolicyContext,
  executeVerificationWithPolicyAsync,
  executeVerificationWithPolicySync,
  resolveVerificationPolicyInput,
  type PolicyReconcileContext,
} from "./verificationPolicy.js";
import { withFailureDiagnostic } from "./verificationDiagnostics.js";
import { buildVerificationRunContext } from "./verificationRunContext.js";
import { SQL_VERIFICATION_OUTCOME_CODE } from "./wireReasonCodes.js";

function defaultTruthReportToStderr(report: string): void {
  process.stderr.write(`${report}\n`);
}
const validateEvent = loadSchemaValidator("event");

export function loadToolsRegistry(registryPath: string): Map<string, ToolRegistryEntry> {
  return buildRegistryMap(loadRegistryEntriesAfterSchema(registryPath));
}

function observedExecutionFromParams(params: Record<string, unknown>): ObservedExecution {
  return { paramsCanonical: canonicalJsonForParams(params) };
}

function intendedEffectNarrative(
  entry: ToolRegistryEntry | undefined,
  toolId: string,
  params: Record<string, unknown>,
): IntendedEffect {
  const narrative = entry
    ? renderIntendedEffect(entry.effectDescriptionTemplate, params)
    : `Unknown tool: ${toolId}`;
  return { narrative };
}

function buildDivergentStepOutcome(
  plan: LogicalStepPlan,
  registry: Map<string, ToolRegistryEntry>,
): StepOutcome {
  const last = plan.last;
  const n = plan.repeatObservationCount;
  const entry = registry.get(last.toolId);
  return {
    seq: plan.seq,
    toolId: last.toolId,
    intendedEffect: intendedEffectNarrative(entry, last.toolId, last.params),
    observedExecution: observedExecutionFromParams(last.params),
    verificationRequest: null,
    status: "incomplete_verification",
    reasons: [
      {
        code: SQL_VERIFICATION_OUTCOME_CODE.RETRY_OBSERVATIONS_DIVERGE,
        message: RETRY_OBSERVATIONS_DIVERGE_MESSAGE,
      },
    ],
    evidenceSummary: {},
    repeatObservationCount: n,
    evaluatedObservationOrdinal: n,
  };
}

function logStepOutcome(
  logStep: (line: object) => void,
  workflowId: string,
  outcome: StepOutcome,
): void {
  logStep({
    workflowId,
    seq: outcome.seq,
    toolId: outcome.toolId,
    intendedEffect: outcome.intendedEffect,
    observedExecution: outcome.observedExecution,
    verificationRequest: outcome.verificationRequest,
    status: outcome.status,
    reasons: outcome.reasons,
    evidenceSummary: outcome.evidenceSummary,
    repeatObservationCount: outcome.repeatObservationCount,
    evaluatedObservationOrdinal: outcome.evaluatedObservationOrdinal,
    ...(outcome.failureDiagnostic !== undefined ? { failureDiagnostic: outcome.failureDiagnostic } : {}),
  });
}

export function verifyToolObservedStep(options: {
  workflowId: string;
  ev: ToolObservedEvent;
  registry: Map<string, ToolRegistryEntry>;
  db: DatabaseSync;
  logStep: (line: object) => void;
  verificationPolicy: VerificationPolicy;
  repeatObservationCount?: number;
}): StepOutcome {
  const { workflowId, ev, registry, db, logStep, verificationPolicy } = options;
  const repeatObservationCount = options.repeatObservationCount ?? 1;
  const evaluatedObservationOrdinal = repeatObservationCount;
  const entry = registry.get(ev.toolId);
  if (!entry) {
    const outcome: StepOutcome = {
      seq: ev.seq,
      toolId: ev.toolId,
      intendedEffect: intendedEffectNarrative(undefined, ev.toolId, ev.params),
      observedExecution: observedExecutionFromParams(ev.params),
      verificationRequest: null,
      status: "incomplete_verification",
      reasons: [{ code: SQL_VERIFICATION_OUTCOME_CODE.UNKNOWN_TOOL, message: `Unknown toolId: ${ev.toolId}` }],
      evidenceSummary: {},
      repeatObservationCount,
      evaluatedObservationOrdinal,
    };
    const finalized = withFailureDiagnostic(outcome);
    logStepOutcome(logStep, workflowId, finalized);
    return finalized;
  }

  const intendedEffect = intendedEffectNarrative(entry, ev.toolId, ev.params);
  const observedExecution = observedExecutionFromParams(ev.params);
  const resolved = resolveVerificationRequest(entry, ev.params);
  if (!resolved.ok) {
    const outcome: StepOutcome = {
      seq: ev.seq,
      toolId: ev.toolId,
      intendedEffect,
      observedExecution,
      verificationRequest: null,
      status: "incomplete_verification",
      reasons: [{ code: resolved.code, message: resolved.message }],
      evidenceSummary: {},
      repeatObservationCount,
      evaluatedObservationOrdinal,
    };
    const finalized = withFailureDiagnostic(outcome);
    logStepOutcome(logStep, workflowId, finalized);
    return finalized;
  }

  const exec = executeVerificationWithPolicySync(db, resolved, verificationPolicy);
  const outcome: StepOutcome = {
    seq: ev.seq,
    toolId: ev.toolId,
    intendedEffect,
    observedExecution,
    verificationRequest: exec.verificationRequest,
    status: exec.status,
    reasons: exec.reasons,
    evidenceSummary: exec.evidenceSummary,
    repeatObservationCount,
    evaluatedObservationOrdinal,
  };
  const finalized = withFailureDiagnostic(outcome);
  logStepOutcome(logStep, workflowId, finalized);
  return finalized;
}

async function verifyToolObservedStepAsync(options: {
  workflowId: string;
  ev: ToolObservedEvent;
  registry: Map<string, ToolRegistryEntry>;
  ctx: PolicyReconcileContext;
  logStep: (line: object) => void;
  verificationPolicy: VerificationPolicy;
  repeatObservationCount?: number;
}): Promise<StepOutcome> {
  const { workflowId, ev, registry, ctx, logStep, verificationPolicy } = options;
  const repeatObservationCount = options.repeatObservationCount ?? 1;
  const evaluatedObservationOrdinal = repeatObservationCount;
  const entry = registry.get(ev.toolId);
  if (!entry) {
    const outcome: StepOutcome = {
      seq: ev.seq,
      toolId: ev.toolId,
      intendedEffect: intendedEffectNarrative(undefined, ev.toolId, ev.params),
      observedExecution: observedExecutionFromParams(ev.params),
      verificationRequest: null,
      status: "incomplete_verification",
      reasons: [{ code: SQL_VERIFICATION_OUTCOME_CODE.UNKNOWN_TOOL, message: `Unknown toolId: ${ev.toolId}` }],
      evidenceSummary: {},
      repeatObservationCount,
      evaluatedObservationOrdinal,
    };
    const finalized = withFailureDiagnostic(outcome);
    logStepOutcome(logStep, workflowId, finalized);
    return finalized;
  }

  const intendedEffect = intendedEffectNarrative(entry, ev.toolId, ev.params);
  const observedExecution = observedExecutionFromParams(ev.params);
  const resolved = resolveVerificationRequest(entry, ev.params);
  if (!resolved.ok) {
    const outcome: StepOutcome = {
      seq: ev.seq,
      toolId: ev.toolId,
      intendedEffect,
      observedExecution,
      verificationRequest: null,
      status: "incomplete_verification",
      reasons: [{ code: resolved.code, message: resolved.message }],
      evidenceSummary: {},
      repeatObservationCount,
      evaluatedObservationOrdinal,
    };
    const finalized = withFailureDiagnostic(outcome);
    logStepOutcome(logStep, workflowId, finalized);
    return finalized;
  }

  const exec = await executeVerificationWithPolicyAsync(resolved, verificationPolicy, ctx);
  const outcome: StepOutcome = {
    seq: ev.seq,
    toolId: ev.toolId,
    intendedEffect,
    observedExecution,
    verificationRequest: exec.verificationRequest,
    status: exec.status,
    reasons: exec.reasons,
    evidenceSummary: exec.evidenceSummary,
    repeatObservationCount,
    evaluatedObservationOrdinal,
  };
  const finalized = withFailureDiagnostic(outcome);
  logStepOutcome(logStep, workflowId, finalized);
  return finalized;
}

function runLogicalStepsVerificationSync(options: {
  workflowId: string;
  events: ToolObservedEvent[];
  registry: Map<string, ToolRegistryEntry>;
  db: DatabaseSync;
  logStep: (line: object) => void;
  verificationPolicy: VerificationPolicy;
}): StepOutcome[] {
  const plans = planLogicalSteps(options.events);
  const out: StepOutcome[] = [];
  for (const plan of plans) {
    const n = plan.repeatObservationCount;
    if (plan.divergent) {
      const outcome = buildDivergentStepOutcome(plan, options.registry);
      const finalized = withFailureDiagnostic(outcome);
      logStepOutcome(options.logStep, options.workflowId, finalized);
      out.push(finalized);
      continue;
    }
    out.push(
      verifyToolObservedStep({
        workflowId: options.workflowId,
        ev: plan.last,
        registry: options.registry,
        db: options.db,
        logStep: options.logStep,
        verificationPolicy: options.verificationPolicy,
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
  ctx: PolicyReconcileContext;
  logStep: (line: object) => void;
  verificationPolicy: VerificationPolicy;
}): Promise<StepOutcome[]> {
  const plans = planLogicalSteps(options.events);
  const out: StepOutcome[] = [];
  for (const plan of plans) {
    const n = plan.repeatObservationCount;
    if (plan.divergent) {
      const outcome = buildDivergentStepOutcome(plan, options.registry);
      const finalized = withFailureDiagnostic(outcome);
      logStepOutcome(options.logStep, options.workflowId, finalized);
      out.push(finalized);
      continue;
    }
    out.push(
      await verifyToolObservedStepAsync({
        workflowId: options.workflowId,
        ev: plan.last,
        registry: options.registry,
        ctx: options.ctx,
        logStep: options.logStep,
        verificationPolicy: options.verificationPolicy,
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
  verificationPolicy?: VerificationPolicy;
  logStep?: (line: object) => void;
  truthReport?: (report: string) => void;
}): Promise<WorkflowResult> {
  const { eventsPath, registryPath, workflowId, database } = options;
  const log = options.logStep ?? (() => {});
  const truthReport = options.truthReport ?? defaultTruthReportToStderr;
  const verificationPolicy = resolveVerificationPolicyInput(options.verificationPolicy);

  const { events, runEvents, runLevelReasons, eventSequenceIntegrity } = loadEventsForWorkflow(
    eventsPath,
    workflowId,
  );
  const verificationRunContext = buildVerificationRunContext(runEvents);
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
      if (verificationPolicy.consistencyMode === "strong") {
        steps = runLogicalStepsVerificationSync({
          workflowId,
          events,
          registry,
          db,
          logStep: log,
          verificationPolicy,
        });
      } else {
        const ctx = createSqlitePolicyContext(db);
        steps = await runLogicalStepsVerificationAsync({
          workflowId,
          events,
          registry,
          ctx,
          logStep: log,
          verificationPolicy,
        });
      }
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
    const ctx: PolicyReconcileContext = {
      reconcileRow: (req) => reconcileSqlRowAsync(backend, req),
      reconcileRowAbsent: (req) => backend.reconcileRowAbsent(req),
      reconcileRelationalCheck: (check) => reconcileRelationalPostgres(client, check),
    };
    try {
      steps = await runLogicalStepsVerificationAsync({
        workflowId,
        events,
        registry,
        ctx,
        logStep: log,
        verificationPolicy,
      });
    } finally {
      try {
        await client.end();
      } catch {
        /* cleanup only */
      }
    }
  }

  const engineBase = aggregateWorkflow(
    workflowId,
    steps,
    runLevelReasons,
    verificationPolicy,
    eventSequenceIntegrity,
  );
  const engine = { ...engineBase, verificationRunContext };
  truthReport(formatWorkflowTruthReport(engine));
  return finalizeEmittedWorkflowResult(engine);
}

const POST_CLOSE_MSG = "Workflow verification observeStep invoked after workflow run completed";

class WorkflowVerificationSession {
  private readonly workflowId: string;
  private readonly registry: Map<string, ToolRegistryEntry>;
  private readonly db: DatabaseSync;
  private readonly logStep: (line: object) => void;
  private readonly verificationPolicy: VerificationPolicy;
  private readonly bufferedEvents: ToolObservedEvent[] = [];
  private readonly bufferedRunEvents: RunEvent[] = [];
  private readonly runLevelReasons: Reason[] = [];
  private observeForbidden = false;
  private dbOpen = true;

  constructor(
    workflowId: string,
    registry: Map<string, ToolRegistryEntry>,
    db: DatabaseSync,
    logStep: (line: object) => void,
    verificationPolicy: VerificationPolicy,
  ) {
    this.workflowId = workflowId;
    this.registry = registry;
    this.db = db;
    this.logStep = logStep;
    this.verificationPolicy = verificationPolicy;
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
    const ev = value as RunEvent;
    if (ev.workflowId !== this.workflowId) {
      return undefined;
    }
    this.bufferedRunEvents.push(ev);
    if (isToolObservedRunEvent(ev)) {
      this.bufferedEvents.push(ev);
    }
    return undefined;
  }

  closeDbIfOpen(): void {
    if (this.dbOpen) {
      this.db.close();
      this.dbOpen = false;
    }
    this.observeForbidden = true;
  }

  buildWorkflowResult(): WorkflowEngineResult {
    if (!this.dbOpen) {
      throw new Error("Workflow verification buildWorkflowResult invoked after database closed");
    }
    const { eventsSorted, eventSequenceIntegrity } = prepareWorkflowEvents(this.bufferedEvents);
    const steps = runLogicalStepsVerificationSync({
      workflowId: this.workflowId,
      events: eventsSorted,
      registry: this.registry,
      db: this.db,
      logStep: this.logStep,
      verificationPolicy: this.verificationPolicy,
    });
    const base = aggregateWorkflow(
      this.workflowId,
      steps,
      [...this.runLevelReasons],
      this.verificationPolicy,
      eventSequenceIntegrity,
    );
    return { ...base, verificationRunContext: buildVerificationRunContext(this.bufferedRunEvents) };
  }

  /** NDJSON bytes: one `JSON.stringify(event)` plus newline per `observeStep` enqueue, in buffer order. */
  captureNdjsonUtf8(): Buffer {
    const parts: string[] = [];
    for (const ev of this.bufferedRunEvents) {
      parts.push(`${JSON.stringify(ev)}\n`);
    }
    return Buffer.from(parts.join(""), "utf8");
  }
}

export async function withWorkflowVerification(
  options: {
    workflowId: string;
    registryPath: string;
    dbPath: string;
    verificationPolicy?: VerificationPolicy;
    logStep?: (line: object) => void;
    truthReport?: (report: string) => void;
    /**
     * Writes canonical bundle after successful verification (`runId` = basename of `outDir`).
     * Optional `ed25519PrivateKeyPemPath`: PKCS#8 PEM path → schemaVersion 2 + `workflow-result.sig.json`.
     */
    persistBundle?: { outDir: string; ed25519PrivateKeyPemPath?: string };
  },
  run: (observeStep: (value: unknown) => void) => void | Promise<void>,
): Promise<WorkflowResult> {
  const log = options.logStep ?? (() => {});
  const truthReport = options.truthReport ?? defaultTruthReportToStderr;
  const verificationPolicy = resolveVerificationPolicyInput(options.verificationPolicy);
  if (verificationPolicy.consistencyMode === "eventual") {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.EVENTUAL_MODE_NOT_SUPPORTED_IN_PROCESS_HOOK,
      "withWorkflowVerification does not support eventual consistency mode; use verifyWorkflow with batch replay instead.",
    );
  }

  let session: WorkflowVerificationSession | undefined;
  let runFailure: unknown;
  let engine: WorkflowEngineResult | undefined;
  let eventsNdjsonBytes: Buffer | undefined;
  try {
    const registry = loadToolsRegistry(options.registryPath);
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(options.dbPath, { readOnly: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new TruthLayerError(CLI_OPERATIONAL_CODES.SQLITE_DATABASE_OPEN_FAILED, msg, { cause: e });
    }
    session = new WorkflowVerificationSession(options.workflowId, registry, db, log, verificationPolicy);
    await Promise.resolve(run((v) => session!.observeStep(v)));
    engine = session.buildWorkflowResult();
    eventsNdjsonBytes = session.captureNdjsonUtf8();
  } catch (e) {
    runFailure = e;
  } finally {
    session?.closeDbIfOpen();
  }
  if (runFailure !== undefined) {
    throw runFailure;
  }
  truthReport(formatWorkflowTruthReport(engine!));
  const result = finalizeEmittedWorkflowResult(engine!);
  if (options.persistBundle !== undefined) {
    writeAgentRunBundle({
      outDir: options.persistBundle.outDir,
      eventsNdjson: eventsNdjsonBytes ?? Buffer.alloc(0),
      workflowResult: result,
      ...(options.persistBundle.ed25519PrivateKeyPemPath !== undefined
        ? { ed25519PrivateKeyPemPath: options.persistBundle.ed25519PrivateKeyPemPath }
        : {}),
    });
  }
  return result;
}
