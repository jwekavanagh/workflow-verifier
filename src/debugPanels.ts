import type { RunComparisonReport } from "./runComparison.js";
import type { StepOutcome, WorkflowResult } from "./types.js";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Single formatter for trust panel SQL evidence column (Slice 6). */
export function formatSqlEvidenceDetailForTrustPanel(step: StepOutcome): string {
  if (step.verificationRequest === null) {
    return "No SQL verification request (registry resolution or unknown tool).";
  }
  const ev = step.evidenceSummary ?? {};
  if (step.verificationRequest.kind === "sql_effects") {
    const effects = Array.isArray(ev.effects) ? ev.effects.length : (ev.effectCount as number | undefined) ?? 0;
    return `multi_effect effect_rows=${effects}`;
  }
  const rowCount = ev.rowCount;
  if (typeof rowCount === "number") {
    if (ev.field !== undefined && ev.expected !== undefined && ev.actual !== undefined) {
      return `rowCount=${rowCount} field=${String(ev.field)} expected=${String(ev.expected)} actual=${String(ev.actual)}`;
    }
    return `rowCount=${rowCount}`;
  }
  return "SQL evidence present (no rowCount in summary).";
}

const VERIFICATION_BASIS_LINE =
  "Verification outcomes below are from read-only SQL reconciliation against the workflow registry and observed tool parameters—not from model-reported success.";

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
      const vt = t.verifyTarget ?? "";
      const verifyTargetDisplay = vt === "" ? "—" : vt;
      rows.push(
        `<tr data-etl-seq="${seq}">` +
          `<td>${seq}</td>` +
          `<td>${escapeHtml(e.toolId)}</td>` +
          `<td>${escapeHtml(t.outcomeLabel)}</td>` +
          `<td>${escapeHtml(verifyTargetDisplay)}</td>` +
          `<td data-etl-field="sql-evidence">${escapeHtml(formatSqlEvidenceDetailForTrustPanel(e))}</td>` +
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
  // informational text that is not a user-facing finding list (Slice 6 HTML contract).
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

  return [
    `<section data-etl-section="run-trust">`,
    `<p data-etl-verification-basis>${escapeHtml(VERIFICATION_BASIS_LINE)}</p>`,
    `<table data-etl-table="verify-evidence"><thead><tr><th>seq</th><th>toolId</th><th>outcome</th><th>verifyTarget</th><th>sql evidence</th></tr></thead><tbody>`,
    ...rows,
    `</tbody></table>`,
    `<section data-etl-section="execution-path">`,
    executionPathInner,
    `</section>`,
    `</section>`,
  ].join("");
}

export { VERIFICATION_BASIS_LINE, EXECUTION_PATH_EMPTY };
