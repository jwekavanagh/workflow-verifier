"use client";

import { INTEGRATE_ACTIVATION_SHELL_BODY } from "@/generated/integrateActivationShellStatic";
import { useEffect, useState } from "react";

const STORAGE_KEY = "agentskeptic_funnel_anon_id";

/**
 * Single `<pre>`: optional `AGENTSKEPTIC_FUNNEL_ANON_ID` export (from beacon storage) + locked activation shell body.
 */
export function IntegrateActivationBlock() {
  const [text, setText] = useState(INTEGRATE_ACTIVATION_SHELL_BODY);

  useEffect(() => {
    const id = window.localStorage?.getItem(STORAGE_KEY)?.trim();
    if (id) {
      setText(`export AGENTSKEPTIC_FUNNEL_ANON_ID=${id}\n\n${INTEGRATE_ACTIVATION_SHELL_BODY}`);
    }
  }, []);

  return (
    <div data-testid="integrate-activation-block">
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}
