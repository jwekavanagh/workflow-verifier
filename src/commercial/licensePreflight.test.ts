import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLI_OPERATIONAL_CODES } from "../cliOperationalCodes.js";
import { TruthLayerError } from "../truthLayerError.js";
import { runLicensePreflightIfNeeded } from "./licensePreflight.js";

vi.mock("../generated/commercialBuildFlags.js", () => ({
  LICENSE_PREFLIGHT_ENABLED: true,
  LICENSE_API_BASE_URL: "https://license.example.com",
}));

const MOCK_UPGRADE_URL = "https://example.com/pricing";

function assertLastMessageTokenIsUrl(message: string, expectedHref: string): void {
  const parts = message.trim().split(/\s+/);
  const token = parts[parts.length - 1]!;
  const url = new URL(token);
  expect(url.href).toBe(expectedHref);
}

describe("runLicensePreflightIfNeeded", () => {
  const keyNames = ["AGENTSKEPTIC_API_KEY", "WORKFLOW_VERIFIER_API_KEY"] as const;
  const orig: Partial<Record<(typeof keyNames)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of keyNames) orig[k] = process.env[k];
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    for (const k of keyNames) {
      if (orig[k] === undefined) delete process.env[k];
      else process.env[k] = orig[k]!;
    }
  });

  it("throws LICENSE_KEY_MISSING when key unset", async () => {
    delete process.env.AGENTSKEPTIC_API_KEY;
    delete process.env.WORKFLOW_VERIFIER_API_KEY;
    await expect(runLicensePreflightIfNeeded()).rejects.toMatchObject({
      code: CLI_OPERATIONAL_CODES.LICENSE_KEY_MISSING,
    });
  });

  it("returns when server allows", async () => {
    process.env.AGENTSKEPTIC_API_KEY = "wf_sk_live_test";
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ allowed: true, plan: "starter", limit: 0, used: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const out = await runLicensePreflightIfNeeded("verify");
    expect(fetch).toHaveBeenCalled();
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    const sent = JSON.parse(init.body as string) as { run_id: string; intent: string };
    expect(sent).toMatchObject({ intent: "verify" });
    expect(out.runId).toBe(sent.run_id);
  });

  it("sends intent enforce when requested", async () => {
    process.env.AGENTSKEPTIC_API_KEY = "wf_sk_live_test";
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ allowed: true, plan: "team", limit: 100, used: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await runLicensePreflightIfNeeded("enforce");
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({ intent: "enforce" });
  });

  it("throws VERIFICATION_REQUIRES_SUBSCRIPTION when server returns that code", async () => {
    process.env.AGENTSKEPTIC_API_KEY = "wf_sk_live_test";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          allowed: false,
          code: "VERIFICATION_REQUIRES_SUBSCRIPTION",
          message: "Subscribe first.",
          upgrade_url: MOCK_UPGRADE_URL,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(runLicensePreflightIfNeeded("verify")).rejects.toSatisfy((e: unknown) => {
      if (!(e instanceof TruthLayerError)) return false;
      if (e.code !== CLI_OPERATIONAL_CODES.VERIFICATION_REQUIRES_SUBSCRIPTION) return false;
      assertLastMessageTokenIsUrl(e.message, MOCK_UPGRADE_URL);
      return true;
    });
  });

  it("throws LICENSE_DENIED with upgrade_url for SUBSCRIPTION_INACTIVE", async () => {
    process.env.AGENTSKEPTIC_API_KEY = "wf_sk_live_test";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          allowed: false,
          code: "SUBSCRIPTION_INACTIVE",
          message: "Subscription is not active.",
          upgrade_url: MOCK_UPGRADE_URL,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(runLicensePreflightIfNeeded("verify")).rejects.toSatisfy((e: unknown) => {
      if (!(e instanceof TruthLayerError)) return false;
      if (e.code !== CLI_OPERATIONAL_CODES.LICENSE_DENIED) return false;
      assertLastMessageTokenIsUrl(e.message, MOCK_UPGRADE_URL);
      return true;
    });
  });

  it("throws LICENSE_DENIED for BILLING_PRICE_UNMAPPED with deployment wording", async () => {
    process.env.AGENTSKEPTIC_API_KEY = "wf_sk_live_test";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          allowed: false,
          code: "BILLING_PRICE_UNMAPPED",
          message:
            "This deployment does not recognize Stripe price id price_x. Align STRIPE_PRICE_* environment variables with your Stripe prices, redeploy, or contact the site operator.",
          upgrade_url: MOCK_UPGRADE_URL,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(runLicensePreflightIfNeeded("verify")).rejects.toSatisfy((e: unknown) => {
      if (!(e instanceof TruthLayerError)) return false;
      if (e.code !== CLI_OPERATIONAL_CODES.LICENSE_DENIED) return false;
      if (!e.message.includes("STRIPE_PRICE_")) return false;
      assertLastMessageTokenIsUrl(e.message, MOCK_UPGRADE_URL);
      if (/portal|manage billing|\/account/i.test(e.message)) return false;
      return true;
    });
  });

  it("throws ENFORCEMENT_REQUIRES_PAID_PLAN when server returns that code", async () => {
    process.env.AGENTSKEPTIC_API_KEY = "wf_sk_live_test";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          allowed: false,
          code: "ENFORCEMENT_REQUIRES_PAID_PLAN",
          message: "Enforcing correctness in workflows requires a paid plan.",
          upgrade_url: MOCK_UPGRADE_URL,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(runLicensePreflightIfNeeded("enforce")).rejects.toSatisfy((e: unknown) => {
      if (!(e instanceof TruthLayerError)) return false;
      if (e.code !== CLI_OPERATIONAL_CODES.ENFORCEMENT_REQUIRES_PAID_PLAN) return false;
      assertLastMessageTokenIsUrl(e.message, MOCK_UPGRADE_URL);
      return true;
    });
  });

  it("throws LICENSE_DENIED on 403 body", async () => {
    process.env.AGENTSKEPTIC_API_KEY = "wf_sk_live_test";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ allowed: false, code: "QUOTA_EXCEEDED", message: "Cap hit" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(runLicensePreflightIfNeeded("verify")).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof TruthLayerError &&
        e.code === CLI_OPERATIONAL_CODES.LICENSE_DENIED &&
        e.message.includes("Cap hit"),
    );
  });

  it("accepts legacy WORKFLOW_VERIFIER_API_KEY when AGENTSKEPTIC_API_KEY unset", async () => {
    delete process.env.AGENTSKEPTIC_API_KEY;
    process.env.WORKFLOW_VERIFIER_API_KEY = "wf_sk_live_test";
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ allowed: true, plan: "starter", limit: 0, used: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const out = await runLicensePreflightIfNeeded("verify");
    expect(fetch).toHaveBeenCalled();
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    const sent = JSON.parse(init.body as string) as { run_id: string };
    expect(out.runId).toBe(sent.run_id);
  });

  it("uses opts.runId for reserve body when provided", async () => {
    process.env.AGENTSKEPTIC_API_KEY = "wf_sk_live_test";
    delete process.env.AGENTSKEPTIC_RUN_ID;
    delete process.env.WORKFLOW_VERIFIER_RUN_ID;
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ allowed: true, plan: "starter", limit: 0, used: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const rid = "caller-fixed-run-id";
    const out = await runLicensePreflightIfNeeded("verify", { runId: rid });
    expect(out.runId).toBe(rid);
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    const sent = JSON.parse(init.body as string) as { run_id: string };
    expect(sent.run_id).toBe(rid);
  });
});
