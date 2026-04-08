import type { RunComparisonReport } from "./runComparison.js";
import { PLAN_TRANSITION_WORKFLOW_ID } from "./planTransitionConstants.js";
import {
  formatBatchDeclaredStderrValue,
  formatBatchExpectedStderrValue,
  formatBatchObservedStateSummary,
  formatBatchVerificationVerdictStderrValue,
  RECONCILIATION_TITLE_DECLARED,
  RECONCILIATION_TITLE_EXPECTED,
  RECONCILIATION_TITLE_OBSERVED_DATABASE,
  RECONCILIATION_TITLE_VERIFICATION_VERDICT,
} from "./reconciliationPresentation.js";
import type { StepOutcome, WorkflowResult, WorkflowTruthStep } from "./types.js";
import { HUMAN_REPORT_PLAN_TRANSITION_PHRASE, HUMAN_REPORT_RESULT_PHRASE } from "./workflowTruthReport.js";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Trust panel / tests: observed database summary (operational-message normalized). */
export function formatSqlEvidenceDetailForTrustPanel(step: StepOutcome): string {
  return formatBatchObservedStateSummary(step);
}

function declaredCellHtml(s: WorkflowTruthStep, toolIdRaw: string): string {
  const declaredPlain = formatBatchDeclaredStderrValue(
    toolIdRaw,
    s.intendedEffect.narrative,
    s.observedExecution.paramsCanonical,
  );
  const idx = declaredPlain.indexOf("parameters_digest=");
  if (idx <= 0) {
    return escapeHtml(declaredPlain);
  }
  return `${escapeHtml(declaredPlain.slice(0, idx))}<br />${escapeHtml(declaredPlain.slice(idx))}`;
}

const VERIFICATION_BASIS_LINE =
  "Verification outcomes below are from read-only SQL reconciliation against the workflow registry and observed tool parameters—not from model-reported success.";

const PLAN_TRANSITION_VERIFICATION_BASIS_LINE =
  "Verification outcomes below are from git diff (name-status) and machine-declared plan rules (YAML front matter planValidation, body section Repository transition validation, or derived path citations as required diff surfaces)—not from model-reported success.";

const EXECUTION_PATH_EMPTY = "No execution-path concerns recorded for this run.";

/** HTML fragment for Compare tab (server-side only). */
export function renderComparePanelHtml(report: RunComparisonReport): string {
  const ra = report.reliabilityAssessment;
  const ch = report.compareHighlights;
  const headline = `${ra.headlineVerdict}: ${ra.headlineRationale}`;
  const windowLine = `Window trend: ${ra.windowTrend} (run index 0 vs run index ${report.runs.length - 1}).`;
  const pairwiseLine = `Pairwise trend: ${ra.pairwiseTrend} (run index ${report.pairwise.priorRunIndex} vs ${report.pairwise.currentRunIndex}).`;
  const recurrenceLine = ra.recurrenceBurden.rationale;

  const liIntro = ch.introducedLogicalStepKeys.map((k) => `<li>${escapeHtml(k)}</li>`).join("");
  const liRes = ch.resolvedLogicalStepKeys.map((k) => `<li>${escapeHtml(k)}</li>`).join("");
  const liRec = ch.recurringSignatures.map((k) => `<li>${escapeHtml(k)}</li>`).join("");

  return [
    `<section data-etl-section="compare-result">`,
    `<p data-etl-headline>${escapeHtml(headline)}</p>`,
    `<p data-etl-window-trend>${escapeHtml(windowLine)}</p>`,
    `<p data-etl-pairwise-trend>${escapeHtml(pairwiseLine)}</p>`,
    `<p data-etl-recurrence>${escapeHtml(recurrenceLine)}</p>`,
    `<ul data-etl-list="introduced">${liIntro}</ul>`,
    `<ul data-etl-list="resolved">${liRes}</ul>`,
    `<ul data-etl-list="recurring">${liRec}</ul>`,
    `</section>`,
  ].join("");
}

/** HTML fragment for run-detail trust + execution path (server-side only). */
export function renderRunTrustPanelHtml(wf: WorkflowResult): string {
  const truthSteps = wf.workflowTruthReport.steps;
  const engineSteps = wf.steps;
  const truthBySeq = new Map(truthSteps.map((s) => [s.seq, s]));
  const engineBySeq = new Map(engineSteps.map((s) => [s.seq, s]));
  const allSeq = [...new Set([...truthBySeq.keys(), ...engineBySeq.keys()])].sort((a, b) => a - b);

  const rows: string[] = [];
  for (const seq of allSeq) {
    const t = truthBySeq.get(seq);
    const e = engineBySeq.get(seq);
    if (t && e) {
      const stepPhraseMap =
        wf.workflowId === PLAN_TRANSITION_WORKFLOW_ID
          ? HUMAN_REPORT_PLAN_TRANSITION_PHRASE
          : HUMAN_REPORT_RESULT_PHRASE;
      const phrase = stepPhraseMap[t.outcomeLabel];
      const expectedVal = formatBatchExpectedStderrValue(t.verifyTarget);
      const verdictVal = formatBatchVerificationVerdictStderrValue(
        t.outcomeLabel,
        phrase,
        t.outcomeLabel !== "VERIFIED" ? t.failureCategory : undefined,
      );
      rows.push(
        `<tr data-etl-seq="${seq}">` +
          `<td>${seq}</td>` +
          `<td data-etl-dimension="declared">${declaredCellHtml(t, e.toolId)}</td>` +
          `<td data-etl-dimension="expected">${escapeHtml(expectedVal)}</td>` +
          `<td data-etl-dimension="observed_database">${escapeHtml(t.observedStateSummary)}</td>` +
          `<td data-etl-dimension="verification_verdict">${escapeHtml(verdictVal)}</td>` +
          `</tr>`,
      );
    } else if (t && !e) {
      rows.push(
        `<tr data-etl-alignment-warning="true"><td colspan="5">${escapeHtml(
          "Alignment warning: step present in truth report only (missing engine step).",
        )} seq=${seq}</td></tr>`,
      );
    } else if (!t && e) {
      rows.push(
        `<tr data-etl-alignment-warning="true"><td colspan="5">${escapeHtml(
          "Alignment warning: step present in engine result only (missing truth step).",
        )} seq=${seq}</td></tr>`,
      );
    }
  }

  const findings = wf.workflowTruthReport.executionPathFindings;
  const summary = wf.workflowTruthReport.executionPathSummary.trim();
  // "No concerns" = no path findings. `executionPathSummary` may still be non-empty for v1
  // informational text that is not a user-facing finding list (compare/trust HTML contract).
  const hasConcerns = findings.length > 0;

  let executionPathInner: string;
  if (!hasConcerns) {
    executionPathInner = `<p data-etl-execution-path-empty>${escapeHtml(EXECUTION_PATH_EMPTY)}</p>`;
  } else {
    const lis = findings
      .map(
        (f) =>
          `<li data-etl-finding-code="${escapeHtml(f.code)}">${escapeHtml(f.code)}: ${escapeHtml(f.message)}</li>`,
      )
      .join("");
    executionPathInner =
      `<p data-etl-execution-path-summary>${escapeHtml(summary)}</p>` +
      `<ol data-etl-list="execution-findings">${lis}</ol>`;
  }

  const basisLine =
    wf.workflowId === PLAN_TRANSITION_WORKFLOW_ID ? PLAN_TRANSITION_VERIFICATION_BASIS_LINE : VERIFICATION_BASIS_LINE;

  return [
    `<section data-etl-section="run-trust">`,
    `<p data-etl-verification-basis>${escapeHtml(basisLine)}</p>`,
    `<table data-etl-table="verify-evidence"><thead><tr><th scope="col">seq</th><th scope="col">${escapeHtml(RECONCILIATION_TITLE_DECLARED)}</th><th scope="col">${escapeHtml(RECONCILIATION_TITLE_EXPECTED)}</th><th scope="col">${escapeHtml(RECONCILIATION_TITLE_OBSERVED_DATABASE)}</th><th scope="col">${escapeHtml(RECONCILIATION_TITLE_VERIFICATION_VERDICT)}</th></tr></thead><tbody>`,
    ...rows,
    `</tbody></table>`,
    `<section data-etl-section="execution-path">`,
    executionPathInner,
    `</section>`,
    `</section>`,
  ].join("");
}

export { VERIFICATION_BASIS_LINE, PLAN_TRANSITION_VERIFICATION_BASIS_LINE, EXECUTION_PATH_EMPTY };
