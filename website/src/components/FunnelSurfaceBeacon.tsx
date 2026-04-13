"use client";

import { useEffect, useRef } from "react";

export function FunnelSurfaceBeacon({
  surface,
}: {
  surface: "acquisition" | "integrate";
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (typeof window === "undefined") return;
    const origin = window.location?.origin;
    if (!origin || origin === "null") return;
    fired.current = true;
    const url = new URL("/api/funnel/surface-impression", origin).href;
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ surface }),
    }).catch(() => {});
  }, [surface]);

  return null;
}
