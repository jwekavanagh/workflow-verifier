import {
  eventSequenceIssue,
  eventSequenceTimestampNotMonotonicReason,
} from "./failureCatalog.js";
import { stableSortEventsBySeq } from "./planLogicalSteps.js";
import type { EventSequenceIntegrity, Reason, ToolObservedEvent } from "./types.js";

function parseTimestampMs(ts: string | undefined): number | null {
  if (ts === undefined) return null;
  const n = Date.parse(ts);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure analysis of capture-ordered events. Does not sort the input.
 * Reasons order: capture monotonicity first, then timestamp (if any), per product spec.
 */
export function analyzeEventSequenceIntegrity(captureOrder: ToolObservedEvent[]): EventSequenceIntegrity {
  if (captureOrder.length === 0) {
    return { kind: "normal" };
  }

  const reasons: Reason[] = [];

  let maxSeqSeen = -Infinity;
  let captureIrregular = false;
  for (const ev of captureOrder) {
    if (ev.seq < maxSeqSeen) {
      captureIrregular = true;
    }
    maxSeqSeen = Math.max(maxSeqSeen, ev.seq);
  }
  if (captureIrregular) {
    reasons.push(eventSequenceIssue("CAPTURE_ORDER_NOT_MONOTONIC_IN_SEQ"));
  }

  const sorted = stableSortEventsBySeq(captureOrder);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const ta = parseTimestampMs(a.timestamp);
    const tb = parseTimestampMs(b.timestamp);
    if (ta === null || tb === null) continue;
    if (ta > tb) {
      reasons.push(eventSequenceTimestampNotMonotonicReason(a.seq, b.seq));
      break;
    }
  }

  if (reasons.length === 0) {
    return { kind: "normal" };
  }
  return { kind: "irregular", reasons };
}
