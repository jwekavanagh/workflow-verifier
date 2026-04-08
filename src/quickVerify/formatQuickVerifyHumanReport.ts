import {
  LINE_PREFIX_DECLARED,
  LINE_PREFIX_EXPECTED,
  LINE_PREFIX_OBSERVED_DATABASE,
  LINE_PREFIX_VERIFICATION_VERDICT,
} from "../reconciliationPresentation.js";
import type { QuickVerifyReport } from "./runQuickVerify.js";
import {
  HUMAN_REPORT_BEGIN,
  HUMAN_REPORT_END,
  humanFragmentForReasonCode,
  humanLineForIngestReasonCode,
  verdictLine,
} from "./quickVerifyHumanCopy.js";

/** Banner after anchor lines (normative: fixed banner strings immediately after the three anchors). */
export const QUICK_VERIFY_BANNER_LINE_1 =
  "Input must be structured tool activity (JSON describing tool calls and parameters)—not arbitrary logs or generic observability text.";
export const QUICK_VERIFY_BANNER_LINE_2 =
  "Quick Verify is inference-only: mapping and expectations are provisional; uncertain is a normal outcome, not an edge case.";
export const QUICK_VERIFY_BANNER_LINE_3 =
  "A rollup pass does not prove execution, does not prove a change occurred, and is not production safety—only that current state matched inferred expectations for the checked units.";

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
  body.push(
    "Layer guide — Declared: tool activity in ingest (see sourceAction). Expected: inferred row/FK checks from declared params (quick mode). Observed: verification object (read-only SQL outcome).",
  );

  for (const u of report.units) {
    const rc = u.reasonCodes.length ? u.reasonCodes.join(", ") : "none";
    const frag = u.reasonCodes.map((c) => humanFragmentForReasonCode(c)).join(" ");
    body.push(
      `- [${u.unitId}] ${u.kind} table=${u.inference.table} tool=${u.sourceAction.toolName} action#${u.sourceAction.actionIndex} verdict=${u.verdict} confidence=${u.confidence} contractEligible=${u.contractEligible}`,
    );
    body.push(`  ${u.explanation}`);
    body.push(`  codes: ${rc}${frag ? ` — ${frag}` : ""}`);
    body.push(`  ${LINE_PREFIX_DECLARED}${u.reconciliation.declared}`);
    body.push(`  ${LINE_PREFIX_EXPECTED}${u.reconciliation.expected}`);
    body.push(`  ${LINE_PREFIX_OBSERVED_DATABASE}${u.reconciliation.observed_database}`);
    body.push(`  ${LINE_PREFIX_VERIFICATION_VERDICT}${u.reconciliation.verification_verdict}`);
    if (u.correctnessDefinition !== undefined) {
      const cd = u.correctnessDefinition;
      body.push(`  correctness_definition: enforcement_kind=${cd.enforcementKind}`);
      body.push(`    must_always_hold: ${cd.mustAlwaysHold}`);
      for (const line of cd.enforceAs) {
        body.push(`    enforce_as: ${line}`);
      }
      body.push(`    enforceable_projection: ${JSON.stringify(cd.enforceableProjection)}`);
    }
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
    `Optional contract replay (partial coverage — exported row tools only; not full relational/multi-effect parity with quick scope): workflow-verifier --workflow-id ${wf} --events ${ev} --registry ${reg} ${dbPart}`,
  );

  const anchors = [HUMAN_REPORT_BEGIN, verdictLine(report.verdict), HUMAN_REPORT_END];
  const banner = [QUICK_VERIFY_BANNER_LINE_1, QUICK_VERIFY_BANNER_LINE_2, QUICK_VERIFY_BANNER_LINE_3];

  return `${anchors.join("\n")}\n${banner.join("\n")}\n\n${body.join("\n")}\n`;
}
