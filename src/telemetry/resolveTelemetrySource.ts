/** Client-declared telemetry bucket for product-activation / OSS claim v2 bodies. */
export type TelemetrySourceWire = "local_dev" | "unknown";

/**
 * OSS / activation v2: `local_dev` only when operator sets AGENTSKEPTIC_TELEMETRY_SOURCE=local_dev; else `unknown`.
 */
export function resolveTelemetrySource(): TelemetrySourceWire {
  if (process.env.AGENTSKEPTIC_TELEMETRY_SOURCE?.trim() === "local_dev") {
    return "local_dev";
  }
  return "unknown";
}
