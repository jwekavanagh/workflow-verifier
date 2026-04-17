"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "agentskeptic_funnel_anon_id";

/**
 * Shows `export AGENTSKEPTIC_FUNNEL_ANON_ID=…` after the surface beacon has stored an id (integrate page).
 */
export function FunnelAnonIdExport() {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const id = window.localStorage?.getItem(STORAGE_KEY)?.trim();
      if (id) {
        setLine(`export AGENTSKEPTIC_FUNNEL_ANON_ID=${id}`);
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, []);

  if (!line) {
    return (
      <details className="muted integrate-funnel-anon-hint">
        <summary>Optional: correlate CLI telemetry with this browser</summary>
        <p>
          After this page finishes loading, a correlation id may appear below for you to export into your shell. This is
          only for optional funnel analytics—not required to run verification.
        </p>
      </details>
    );
  }

  return (
    <div data-testid="funnel-anon-export">
      <p className="muted">
        Optional — correlate CLI telemetry with this browser (same id as the page beacon):
      </p>
      <pre>
        <code>{line}</code>
      </pre>
    </div>
  );
}
