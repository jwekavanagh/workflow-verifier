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
import type { StepOutcome, ToolRegistryEntry, WorkflowResult } from "./types.js";

const validateRegistry = loadSchemaValidator("tools-registry");

export function loadToolsRegistry(registryPath: string): Map<string, ToolRegistryEntry> {
  const raw = readFileSync(registryPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!validateRegistry(parsed)) {
    throw new Error(`Invalid tools registry: ${JSON.stringify(validateRegistry.errors ?? [])}`);
  }
  return buildRegistryMap(parsed as ToolRegistryEntry[]);
}

export function verifyWorkflow(options: {
  workflowId: string;
  eventsPath: string;
  registryPath: string;
  dbPath: string;
  logStep?: (line: object) => void;
}): WorkflowResult {
  const { eventsPath, registryPath, dbPath, workflowId } = options;
  const log = options.logStep ?? ((obj: object) => console.error(JSON.stringify(obj)));

  const { events, runLevelCodes } = loadEventsForWorkflow(eventsPath, workflowId);
  const registry = loadToolsRegistry(registryPath);
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const steps: StepOutcome[] = [];

  try {
    for (const ev of events) {
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
        steps.push(outcome);
        log({
          workflowId,
          seq: ev.seq,
          toolId: ev.toolId,
          intendedEffect: outcome.intendedEffect,
          verificationRequest: null,
          status: outcome.status,
          reasons: outcome.reasons,
          evidenceSummary: outcome.evidenceSummary,
        });
        continue;
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
        steps.push(outcome);
        log({
          workflowId,
          seq: ev.seq,
          toolId: ev.toolId,
          intendedEffect,
          verificationRequest: null,
          status: outcome.status,
          reasons: outcome.reasons,
          evidenceSummary: outcome.evidenceSummary,
        });
        continue;
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
      steps.push(outcome);
      log({
        workflowId,
        seq: ev.seq,
        toolId: ev.toolId,
        intendedEffect,
        verificationRequest: resolved.request,
        status: outcome.status,
        reasons: outcome.reasons,
        evidenceSummary: outcome.evidenceSummary,
      });
    }
  } finally {
    db.close();
  }

  return aggregateWorkflow(workflowId, steps, runLevelCodes);
}
