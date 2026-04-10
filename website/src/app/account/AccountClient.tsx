"use client";

import { useState } from "react";

export function AccountClient({ hasKey }: { hasKey: boolean }) {
  const [key, setKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function createKey() {
    setErr(null);
    const r = await fetch("/api/account/create-key", { method: "POST" });
    const j = (await r.json()) as { apiKey?: string; error?: string };
    if (!r.ok) {
      setErr(j.error ?? "Failed");
      return;
    }
    if (j.apiKey) setKey(j.apiKey);
  }

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <h2>API key</h2>
      {!hasKey && !key && (
        <button type="button" onClick={createKey}>
          Generate API key
        </button>
      )}
      {err && <p style={{ color: "#f4212e" }}>{err}</p>}
      {key && (
        <p data-testid="api-key-plaintext" style={{ wordBreak: "break-all", marginTop: "0.75rem" }}>
          {key}
        </p>
      )}
      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "0.75rem" }}>
        Use <code>WORKFLOW_VERIFIER_API_KEY</code> with the commercial CLI. Start from{" "}
        <a href="/integrate">Integrate</a> for a copy-paste first run on your database. Entitlements:{" "}
        <a
          href="https://github.com/jwekavanagh/workflow-verifier/blob/main/docs/commercial-entitlement-matrix.md"
          rel="noreferrer"
        >
          commercial-entitlement-matrix.md
        </a>
        ,{" "}
        <a
          href="https://github.com/jwekavanagh/workflow-verifier/blob/main/docs/commercial-entitlement-policy.md"
          rel="noreferrer"
        >
          commercial-entitlement-policy.md
        </a>
        . <a href="/pricing">Pricing</a>.
      </p>
    </div>
  );
}
