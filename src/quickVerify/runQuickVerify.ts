import { DatabaseSync } from "node:sqlite";
import { CLI_OPERATIONAL_CODES } from "../cliOperationalCodes.js";
import { buildQuickUnitCorrectnessDefinition } from "../correctnessDefinition.js";
import { TruthLayerError } from "../truthLayerError.js";
import { loadSchemaValidator } from "../schemaLoad.js";
import type { CorrectnessDefinitionV1, ToolRegistryEntry, VerificationRequest } from "../types.js";
import { connectPostgresVerificationClient } from "../sqlReadBackend.js";
import { canonicalToolsArrayUtf8, stableStringify } from "./canonicalJson.js";
import { bucketsForAction } from "./decomposeUnits.js";
import { dedupeActions, ingestActivityUtf8 } from "./ingest.js";
import { planRowUnit } from "./rowUnit.js";
import { planRelationalFromFlat } from "./relationalPlan.js";
import type { SchemaCatalog } from "./schemaCatalogTypes.js";
import { PostgresSchemaCatalog } from "./postgresCatalog.js";
import { SqliteSchemaCatalog } from "./sqliteCatalog.js";
import { exportSqlRowTool } from "./exportTool.js";
import { verifyRowPostgres, verifyRowSqlite, verifyRelatedExists } from "./verifyExecution.js";
import { T_EXPORT, MAX_UNITS } from "./thresholds.js";
import { compareUtf16Id } from "../resolveExpectation.js";
import { MSG_NO_STRUCTURED_TOOL_ACTIVITY, MSG_NO_TOOL_CALLS } from "./quickVerifyHumanCopy.js";
import type { QuickContractExport } from "./buildQuickContractEventsNdjson.js";
import { DEFAULT_QUICK_VERIFY_SCOPE, type QuickVerifyScope } from "./quickVerifyScope.js";
import {
  DEFAULT_QUICK_VERIFY_PRODUCT_TRUTH,
  type QuickVerifyProductTruth,
} from "./quickVerifyProductTruth.js";

export type QuickVerifyReport = {
  schemaVersion: 3;
  verdict: "pass" | "fail" | "uncertain";
  summary: string;
  verificationMode: "inferred";
  scope: QuickVerifyScope;
  productTruth: QuickVerifyProductTruth;
  ingest: { reasonCodes: string[]; malformedLineCount: number };
  ingestWarnings?: Array<{ code: string; actionKey?: string }>;
  runHeaderReasonCodes?: string[];
  units: Array<{
    unitId: string;
    kind: "row" | "related_exists";
    verdict: "verified" | "fail" | "uncertain";
    confidence: number;
    reasonCodes: string[];
    sourceAction: { toolName: string; actionIndex: number };
    contractEligible: boolean;
    inference: { table: string; rationale: string[]; alternates?: unknown[] };
    verification: Record<string, unknown>;
    explanation: string;
    correctnessDefinition?: CorrectnessDefinitionV1;
  }>;
  exportableRegistry: { tools: ToolRegistryEntry[] };
};

export type RunQuickVerifyOptions = {
  inputUtf8: string;
  postgresUrl?: string;
  sqlitePath?: string;
};

export type RunQuickVerifyResult = {
  report: QuickVerifyReport;
  registryUtf8: string;
  contractExports: QuickContractExport[];
};

function rollupVerdict(
  units: QuickVerifyReport["units"],
  ingestCodes: string[],
  hadActions: boolean,
): "pass" | "fail" | "uncertain" {
  if (
    !hadActions &&
    (ingestCodes.includes("INGEST_NO_ACTIONS") || ingestCodes.includes("INGEST_NO_STRUCTURED_TOOL_ACTIVITY"))
  ) {
    return "uncertain";
  }
  if (units.length === 0) return "uncertain";
  if (units.some((u) => u.verdict === "fail")) return "fail";
  if (units.every((u) => u.verdict === "verified")) return "pass";
  return "uncertain";
}

function buildSummary(verdict: string, units: QuickVerifyReport["units"], ingest: QuickVerifyReport["ingest"]): string {
  const parts = [
    `Inferred provisional check — rollup ${verdict} is not a production-safety or audit-final verdict`,
    `${units.length} unit(s)`,
  ];
  if (ingest.reasonCodes.includes("INGEST_NO_ACTIONS")) {
    parts.push(MSG_NO_TOOL_CALLS);
  } else if (ingest.reasonCodes.includes("INGEST_NO_STRUCTURED_TOOL_ACTIVITY")) {
    parts.push(MSG_NO_STRUCTURED_TOOL_ACTIVITY);
  } else if (ingest.reasonCodes.length) {
    parts.push(`ingest: ${ingest.reasonCodes.join(",")}`);
  }
  return parts.join(". ") + ".";
}

export async function runQuickVerify(opts: RunQuickVerifyOptions): Promise<RunQuickVerifyResult> {
  const ingest = ingestActivityUtf8(opts.inputUtf8);
  const ingestBlock = {
    reasonCodes: ingest.reasonCodes,
    malformedLineCount: ingest.malformedLineCount,
  };

  if (ingest.inputTooLarge) {
    const units: QuickVerifyReport["units"] = [];
    const report: QuickVerifyReport = {
      schemaVersion: 3,
      verdict: "uncertain",
      summary: buildSummary("uncertain", units, ingestBlock),
      verificationMode: "inferred",
      scope: { ...DEFAULT_QUICK_VERIFY_SCOPE },
      productTruth: DEFAULT_QUICK_VERIFY_PRODUCT_TRUTH,
      ingest: ingestBlock,
      units,
      exportableRegistry: { tools: [] },
    };
    return { report, registryUtf8: canonicalToolsArrayUtf8([]), contractExports: [] };
  }

  const { unique, droppedWarnings } = dedupeActions(ingest.actions);
  const ingestWarnings = droppedWarnings.length
    ? droppedWarnings.map((code) => ({ code }))
    : undefined;

  let catalog: SchemaCatalog;
  let dialect: "postgres" | "sqlite";
  let pgClient: Awaited<ReturnType<typeof connectPostgresVerificationClient>> | undefined;
  let sqliteDb: DatabaseSync | undefined;

  if (opts.postgresUrl) {
    pgClient = await connectPostgresVerificationClient(opts.postgresUrl);
    catalog = new PostgresSchemaCatalog(pgClient);
    dialect = "postgres";
  } else if (opts.sqlitePath) {
    sqliteDb = new DatabaseSync(opts.sqlitePath, { readOnly: true });
    catalog = new SqliteSchemaCatalog(sqliteDb);
    dialect = "sqlite";
  } else {
    throw new Error("runQuickVerify: postgresUrl or sqlitePath required");
  }

  try {
    const tables = await catalog.listTables();
    const fkEdges = await catalog.listFkEdges();
    const units: QuickVerifyReport["units"] = [];
    const exportTools: ToolRegistryEntry[] = [];
    const contractExports: QuickContractExport[] = [];
    const runHeaderReasonCodes: string[] = [];
    const relationalSeen = new Set<string>();

    const pushUnit = (u: QuickVerifyReport["units"][0]) => {
      if (units.length >= MAX_UNITS) {
        if (!runHeaderReasonCodes.includes("UNIT_CAP_EXCEEDED")) runHeaderReasonCodes.push("UNIT_CAP_EXCEEDED");
        return;
      }
      units.push(u);
    };

    for (let actionIndex = 0; actionIndex < unique.length; actionIndex++) {
      const action = unique[actionIndex]!;
      const sourceAction = { toolName: action.toolName, actionIndex };
      const bs = bucketsForAction(action.toolName, action.flat, tables);
      for (const b of bs) {
        if (units.length >= MAX_UNITS) break;
        const plan = await planRowUnit(catalog, b, tables);
        const uid = `u${units.length}`;
        if (!plan.request) {
          const rc = plan.reasonCodes.length ? plan.reasonCodes : ["MAPPING_FAILED"];
          pushUnit({
            unitId: uid,
            kind: "row",
            verdict: "uncertain",
            confidence: plan.confidence,
            reasonCodes: rc,
            sourceAction,
            contractEligible: false,
            inference: {
              table: b.tableName,
              rationale: plan.rationale,
              alternates: plan.alternates,
            },
            verification: {},
            explanation: plan.rationale.join(" ") || "Could not map row unit.",
            correctnessDefinition: buildQuickUnitCorrectnessDefinition({
              unitId: uid,
              kind: "row",
              toolName: sourceAction.toolName,
              actionIndex: sourceAction.actionIndex,
              table: b.tableName,
              reasonCodes: rc,
            }),
          });
          continue;
        }
        const rowOut =
          dialect === "postgres"
            ? await verifyRowPostgres(pgClient!, plan.request)
            : verifyRowSqlite(sqliteDb!, plan.request);
        const exported = plan.confidence >= T_EXPORT;
        let tid = `quick:${uid}`;
        if (exported) {
          const used = new Set(exportTools.map((t) => t.toolId));
          let n = 1;
          while (used.has(tid)) {
            tid = `quick:${uid}:${n++}`;
          }
          exportTools.push(exportSqlRowTool(tid, plan.request));
          contractExports.push({ toolId: tid, request: plan.request });
        }
        const rowBase = {
          unitId: uid,
          kind: "row" as const,
          verdict: rowOut.verdict,
          confidence: plan.confidence,
          reasonCodes: rowOut.reasonCodes,
          sourceAction,
          contractEligible: exported,
          inference: { table: plan.request.table, rationale: plan.rationale },
          verification: rowOut.verification,
          explanation: rowOut.explanation,
        };
        pushUnit(
          rowOut.verdict === "verified"
            ? rowBase
            : {
                ...rowBase,
                correctnessDefinition: buildQuickUnitCorrectnessDefinition({
                  unitId: uid,
                  kind: "row",
                  toolName: sourceAction.toolName,
                  actionIndex: sourceAction.actionIndex,
                  table: plan.request.table,
                  reasonCodes: rowOut.reasonCodes,
                  sqlRowRequest: plan.request,
                }),
              },
        );
      }

      const rels = planRelationalFromFlat(action.flat, fkEdges);
      for (const rel of rels) {
        if (units.length >= MAX_UNITS) break;
        const rk = `${rel.childTable}\0${rel.matchEq.map((m) => m.column).join(",")}`;
        if (relationalSeen.has(rk)) continue;
        relationalSeen.add(rk);
        const uid = `u${units.length}`;
        const rout =
          dialect === "postgres"
            ? await verifyRelatedExists("postgres", pgClient!, rel)
            : await verifyRelatedExists("sqlite", sqliteDb!, rel);
        const relBase = {
          unitId: uid,
          kind: "related_exists" as const,
          verdict: rout.verdict,
          confidence: 0.8,
          reasonCodes: rout.reasonCodes,
          sourceAction,
          contractEligible: false,
          inference: { table: rel.childTable, rationale: [`FK ${rel.id}`] },
          verification: rout.verification,
          explanation: rout.explanation,
        };
        pushUnit(
          rout.verdict === "verified"
            ? relBase
            : {
                ...relBase,
                correctnessDefinition: buildQuickUnitCorrectnessDefinition({
                  unitId: uid,
                  kind: "related_exists",
                  toolName: sourceAction.toolName,
                  actionIndex: sourceAction.actionIndex,
                  table: rel.childTable,
                  reasonCodes: rout.reasonCodes,
                  relationalCheck: rel,
                }),
              },
        );
      }
    }

    const hadActions = ingest.actions.length > 0;
    const verdict = rollupVerdict(units, ingest.reasonCodes, hadActions);
    exportTools.sort((a, b) => compareUtf16Id(a.toolId, b.toolId));
    contractExports.sort((a, b) => compareUtf16Id(a.toolId, b.toolId));

    const report: QuickVerifyReport = {
      schemaVersion: 3,
      verdict,
      summary: buildSummary(verdict, units, ingestBlock),
      verificationMode: "inferred",
      scope: { ...DEFAULT_QUICK_VERIFY_SCOPE },
      productTruth: DEFAULT_QUICK_VERIFY_PRODUCT_TRUTH,
      ingest: ingestBlock,
      ...(ingestWarnings ? { ingestWarnings } : {}),
      ...(runHeaderReasonCodes.length ? { runHeaderReasonCodes } : {}),
      units,
      exportableRegistry: { tools: exportTools },
    };

    const registryUtf8 = canonicalToolsArrayUtf8(report.exportableRegistry.tools);
    return { report, registryUtf8, contractExports };
  } finally {
    if (pgClient) {
      try {
        await pgClient.end();
      } catch {
        /* */
      }
    }
    if (sqliteDb) {
      try {
        sqliteDb.close();
      } catch {
        /* */
      }
    }
  }
}

/** For tests: stable single-line report JSON */
export function quickReportToStdoutLine(report: QuickVerifyReport): string {
  return stableStringify(report) + "\n";
}

export async function runQuickVerifyToValidatedReport(opts: RunQuickVerifyOptions): Promise<RunQuickVerifyResult> {
  const out = await runQuickVerify(opts);
  const validateQuickReport = loadSchemaValidator("quick-verify-report");
  if (!validateQuickReport(out.report)) {
    throw new TruthLayerError(
      CLI_OPERATIONAL_CODES.WORKFLOW_RESULT_SCHEMA_INVALID,
      JSON.stringify(validateQuickReport.errors ?? []),
    );
  }
  return out;
}
