import type { ProductActivationRequest } from "@/lib/funnelProductActivation.contract";

type StartedBody = Extract<ProductActivationRequest, { event: "verify_started" }>;
type OutcomeBody = Extract<ProductActivationRequest, { event: "verify_outcome" }>;

function telemetrySourceForActivation(
  body:
    | { schema_version: 1 }
    | { schema_version: 2; telemetry_source: "local_dev" | "unknown" },
): "local_dev" | "unknown" | "legacy_unattributed" {
  if (body.schema_version === 2) {
    return body.telemetry_source;
  }
  return "legacy_unattributed";
}

export function rowMetadataVerifyStarted(body: StartedBody) {
  const fid = body.funnel_anon_id?.trim();
  const ts = telemetrySourceForActivation(body);
  return {
    schema_version: body.schema_version,
    run_id: body.run_id,
    issued_at: body.issued_at,
    workload_class: body.workload_class,
    subcommand: body.subcommand,
    build_profile: body.build_profile,
    telemetry_source: ts,
    ...(fid ? { funnel_anon_id: fid } : {}),
  };
}

export function rowMetadataVerifyOutcome(body: OutcomeBody) {
  const fid = body.funnel_anon_id?.trim();
  const ts = telemetrySourceForActivation(body);
  return {
    schema_version: body.schema_version,
    run_id: body.run_id,
    issued_at: body.issued_at,
    workload_class: body.workload_class,
    subcommand: body.subcommand,
    build_profile: body.build_profile,
    terminal_status: body.terminal_status,
    telemetry_source: ts,
    ...(fid ? { funnel_anon_id: fid } : {}),
  };
}
