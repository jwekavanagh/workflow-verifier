"use client";

import { integrateRegistryDraft } from "@/content/productCopy";
import { useCallback, useState } from "react";

export function RegistryDraftPanel() {
  const d = integrateRegistryDraft;
  const [body, setBody] = useState(d.exampleJson);
  const [busy, setBusy] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setResultText(null);
    try {
      const res = await fetch("/api/integrator/registry-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const text = await res.text();
      setResultText(`${res.status}\n${text}`);
    } catch (e) {
      setResultText(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [body]);

  return (
    <section
      id="registry-draft-helper"
      className="integrate-prose muted"
      data-testid="integrate-registry-draft-panel"
    >
      <h2>{d.sectionHeading}</h2>
      {d.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <ul>
        {d.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <details className="registry-draft-technical">
        <summary>{d.technicalSummary}</summary>
        <ul>
          {d.technicalFlowBullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <p className="registry-draft-constraints-cap">{d.technicalConstraintsHeading}</p>
        <ul>
          {d.technicalBullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </details>
      <p>{d.requestLabel}</p>
      <textarea
        className="registry-draft-json"
        spellCheck={false}
        rows={14}
        value={body}
        onChange={(ev) => setBody(ev.target.value)}
        aria-label={d.requestLabel}
      />
      <p>
        <button type="button" className="btn" disabled={busy} onClick={() => void submit()}>
          {d.submitLabel}
        </button>
      </p>
      {resultText ? (
        <pre data-testid="integrate-registry-draft-result">
          <code>{resultText}</code>
        </pre>
      ) : null}
    </section>
  );
}
