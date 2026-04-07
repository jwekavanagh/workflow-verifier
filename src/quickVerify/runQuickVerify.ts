import { DatabaseSync } from "node:sqlite";
import type { ToolRegistryEntry } from "../types.js";
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

export type QuickVerifyReport = {
  schemaVersion: 1;
  verdict: "pass" | "fail" | "uncertain";
  summary: string;
  scope: { quickVerifyVersion: "1.0.0"; capabilities: ["inferred_row", "inferred_related_exists"] };
  ingest: { reasonCodes: string[]; malformedLineCount: number };
  ingestWarnings?: Array<{ code: string; actionKey?: string }>;
  runHeaderReasonCodes?: string[];
  units: Array<{
    unitId: string;
    kind: "row" | "related_exists";
    verdict: "verified" | "fail" | "uncertain";
    confidence: number;
    reasonCodes: string[];
    inference: { table: string; rationale: string[]; alternates?: unknown[] };
    verification: Record<string, unknown>;
    explanation: string;
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
};

function rollupVerdict(
  units: QuickVerifyReport["units"],
  ingestCodes: string[],
  hadActions: boolean,
): "pass" | "fail" | "uncertain" {
  if (!hadActions && ingestCodes.includes("INGEST_NO_ACTIONS")) return "uncertain";
  if (units.length === 0) return "uncertain";
  if (units.some((u) => u.verdict === "fail")) return "fail";
  if (units.every((u) => u.verdict === "verified")) return "pass";
  return "uncertain";
}

function buildSummary(verdict: string, units: QuickVerifyReport["units"], ingest: QuickVerifyReport["ingest"]): string {
  const parts = [`Verdict ${verdict}`, `${units.length} unit(s)`];
  if (ingest.reasonCodes.length) parts.push(`ingest: ${ingest.reasonCodes.join(",")}`);
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
      schemaVersion: 1,
      verdict: "uncertain",
      summary: "Input exceeded MAX_INPUT_BYTES.",
      scope: { quickVerifyVersion: "1.0.0", capabilities: ["inferred_row", "inferred_related_exists"] },
      ingest: ingestBlock,
      units,
      exportableRegistry: { tools: [] },
    };
    return { report, registryUtf8: canonicalToolsArrayUtf8([]) };
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
    const runHeaderReasonCodes: string[] = [];
    const relationalSeen = new Set<string>();

    const pushUnit = (u: QuickVerifyReport["units"][0]) => {
      if (units.length >= MAX_UNITS) {
        if (!runHeaderReasonCodes.includes("UNIT_CAP_EXCEEDED")) runHeaderReasonCodes.push("UNIT_CAP_EXCEEDED");
        return;
      }
      units.push(u);
    };

    for (const action of unique) {
      const bs = bucketsForAction(action.toolName, action.flat, tables);
      for (const b of bs) {
        if (units.length >= MAX_UNITS) break;
        const plan = await planRowUnit(catalog, b, tables);
        const uid = `u${units.length}`;
        if (!plan.request) {
          pushUnit({
            unitId: uid,
            kind: "row",
            verdict: "uncertain",
            confidence: plan.confidence,
            reasonCodes: plan.reasonCodes.length ? plan.reasonCodes : ["MAPPING_FAILED"],
            inference: {
              table: b.tableName,
              rationale: plan.rationale,
              alternates: plan.alternates,
            },
            verification: {},
            explanation: plan.rationale.join(" ") || "Could not map row unit.",
          });
          continue;
        }
        const rowOut =
          dialect === "postgres"
            ? await verifyRowPostgres(pgClient!, plan.request)
            : verifyRowSqlite(sqliteDb!, plan.request);
        pushUnit({
          unitId: uid,
          kind: "row",
          verdict: rowOut.verdict,
          confidence: plan.confidence,
          reasonCodes: rowOut.reasonCodes,
          inference: { table: plan.request.table, rationale: plan.rationale },
          verification: rowOut.verification,
          explanation: rowOut.explanation,
        });
        if (plan.confidence >= T_EXPORT && plan.request) {
          let tid = `quick:${uid}`;
          const used = new Set(exportTools.map((t) => t.toolId));
          let n = 1;
          while (used.has(tid)) {
            tid = `quick:${uid}:${n++}`;
          }
          exportTools.push(exportSqlRowTool(tid, plan.request));
        }
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
        pushUnit({
          unitId: uid,
          kind: "related_exists",
          verdict: rout.verdict,
          confidence: 0.8,
          reasonCodes: rout.reasonCodes,
          inference: { table: rel.childTable, rationale: [`FK ${rel.id}`] },
          verification: rout.verification,
          explanation: rout.explanation,
        });
      }
    }

    const hadActions = ingest.actions.length > 0;
    const verdict = rollupVerdict(units, ingest.reasonCodes, hadActions);
    const report: QuickVerifyReport = {
      schemaVersion: 1,
      verdict,
      summary: buildSummary(verdict, units, ingestBlock),
      scope: { quickVerifyVersion: "1.0.0", capabilities: ["inferred_row", "inferred_related_exists"] },
      ingest: ingestBlock,
      ...(ingestWarnings ? { ingestWarnings } : {}),
      ...(runHeaderReasonCodes.length ? { runHeaderReasonCodes } : {}),
      units,
      exportableRegistry: { tools: exportTools.sort((a, b) => compareUtf16Id(a.toolId, b.toolId)) },
    };

    const registryUtf8 = canonicalToolsArrayUtf8(report.exportableRegistry.tools);
    return { report, registryUtf8 };
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
