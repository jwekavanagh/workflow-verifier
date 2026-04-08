import type { QuickVerifyReport } from "./runQuickVerify.js";
import {
  HUMAN_REPORT_BEGIN,
  HUMAN_REPORT_END,
  humanFragmentForReasonCode,
  humanLineForIngestReasonCode,
  verdictLine,
} from "./quickVerifyHumanCopy.js";

export type QuickHumanReportCliContext = {
  workflowId?: string;
  eventsPath?: string;
  registryPath?: string;
  dbFlag?: string;
  postgresUrl?: boolean;
};

/**
 * Machine-testable anchors: first three lines exactly, in order. All other prose follows line 3.
 */
export function formatQuickVerifyHumanReport(
  report: QuickVerifyReport,
  ctx: QuickHumanReportCliContext = {},
): string {
  const body: string[] = [];

  const seenIngest = new Set<string>();
  for (const code of report.ingest.reasonCodes) {
    if (seenIngest.has(code)) continue;
    seenIngest.add(code);
    body.push(humanLineForIngestReasonCode(code));
  }
  if (report.ingest.malformedLineCount > 0) {
    body.push(`Malformed JSON lines: ${report.ingest.malformedLineCount}.`);
  }
  if (report.runHeaderReasonCodes?.length) {
    body.push(`Run notes: ${report.runHeaderReasonCodes.join(", ")}.`);
  }

  body.push("");
  body.push("Units:");

  for (const u of report.units) {
    const rc = u.reasonCodes.length ? u.reasonCodes.join(", ") : "none";
    const frag = u.reasonCodes.map((c) => humanFragmentForReasonCode(c)).join(" ");
    body.push(
      `- [${u.unitId}] ${u.kind} table=${u.inference.table} tool=${u.sourceAction.toolName} action#${u.sourceAction.actionIndex} verdict=${u.verdict} confidence=${u.confidence} contractEligible=${u.contractEligible}`,
    );
    body.push(`  ${u.explanation}`);
    body.push(`  codes: ${rc}${frag ? ` — ${frag}` : ""}`);
  }

  if (report.units.length === 0) {
    body.push("(none)");
  }

  body.push("");
  const wf = ctx.workflowId ?? "<workflowId>";
  const ev = ctx.eventsPath ?? "<events.ndjson>";
  const reg = ctx.registryPath ?? "<registry.json>";
  const dbPart = ctx.postgresUrl
    ? `--postgres-url "<url>"`
    : ctx.dbFlag
      ? `--db ${ctx.dbFlag}`
      : `--db <sqlitePath>`;
  body.push(
    `Contract replay (row tools only): verify-workflow --workflow-id ${wf} --events ${ev} --registry ${reg} ${dbPart}`,
  );

  const anchors = [HUMAN_REPORT_BEGIN, verdictLine(report.verdict), HUMAN_REPORT_END];

  return `${anchors.join("\n")}\n\n${body.join("\n")}\n`;
}
