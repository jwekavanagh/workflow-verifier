/**
 * CLI activation telemetry: stable install_id across verify_started / verify_outcome
 * (requires `npm run build` — imports from dist/).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function setSandboxHome(home) {
  process.env.HOME = home;
  if (process.platform === "win32") {
    process.env.USERPROFILE = home;
  }
}

function restoreSandboxHome(prevHome, prevUserProfile) {
  if (prevHome !== undefined) process.env.HOME = prevHome;
  else delete process.env.HOME;
  if (process.platform === "win32") {
    if (prevUserProfile !== undefined) process.env.USERPROFILE = prevUserProfile;
    else delete process.env.USERPROFILE;
  }
}

describe("postProductActivationEvent install_id", () => {
  let prevHome;
  let prevUserProfile;
  let prevTelemetry;
  let prevFetch;
  /** @type {{ url: string; body: Record<string, unknown> }[]} */
  let fetchCalls;

  beforeEach(async () => {
    fetchCalls = [];
    prevHome = process.env.HOME;
    prevUserProfile = process.env.USERPROFILE;
    prevTelemetry = process.env.AGENTSKEPTIC_TELEMETRY;
    prevFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
      return { ok: true, status: 204 };
    };
    const { resetCliInstallIdModuleStateForTests } = await import(
      "../dist/telemetry/cliInstallId.js"
    );
    resetCliInstallIdModuleStateForTests();
  });

  afterEach(async () => {
    globalThis.fetch = prevFetch;
    restoreSandboxHome(prevHome, prevUserProfile);
    if (prevTelemetry !== undefined) process.env.AGENTSKEPTIC_TELEMETRY = prevTelemetry;
    else delete process.env.AGENTSKEPTIC_TELEMETRY;
    const { resetCliInstallIdModuleStateForTests } = await import(
      "../dist/telemetry/cliInstallId.js"
    );
    resetCliInstallIdModuleStateForTests();
  });

  it("telemetry-off: no fetch and no config file under sandbox HOME", async () => {
    const home = mkdtempSync(join(tmpdir(), "as-telemetry-off-"));
    try {
      setSandboxHome(home);
      process.env.AGENTSKEPTIC_TELEMETRY = "0";
      const { postProductActivationEvent } = await import(
        "../dist/telemetry/postProductActivationEvent.js"
      );
      await postProductActivationEvent({
        phase: "verify_started",
        run_id: "run-off-1",
        issued_at: new Date().toISOString(),
        workload_class: "non_bundled",
        workflow_lineage: "integrator_scoped",
        subcommand: "batch_verify",
        build_profile: "oss",
      });
      await postProductActivationEvent({
        phase: "verify_outcome",
        run_id: "run-off-1",
        issued_at: new Date().toISOString(),
        workload_class: "non_bundled",
        workflow_lineage: "integrator_scoped",
        subcommand: "batch_verify",
        build_profile: "oss",
        terminal_status: "complete",
      });
      assert.equal(fetchCalls.length, 0);
      const cfg = join(home, ".agentskeptic", "config.json");
      assert.equal(existsSync(cfg), false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("persisted HOME: same install_id on started and outcome POST bodies", async () => {
    const home = mkdtempSync(join(tmpdir(), "as-install-persist-"));
    try {
      setSandboxHome(home);
      delete process.env.AGENTSKEPTIC_TELEMETRY;
      const { postProductActivationEvent } = await import(
        "../dist/telemetry/postProductActivationEvent.js"
      );
      const issued = new Date().toISOString();
      await postProductActivationEvent({
        phase: "verify_started",
        run_id: "run-persist-1",
        issued_at: issued,
        workload_class: "non_bundled",
        workflow_lineage: "integrator_scoped",
        subcommand: "batch_verify",
        build_profile: "oss",
      });
      await postProductActivationEvent({
        phase: "verify_outcome",
        run_id: "run-persist-1",
        issued_at: issued,
        workload_class: "non_bundled",
        workflow_lineage: "integrator_scoped",
        subcommand: "batch_verify",
        build_profile: "oss",
        terminal_status: "complete",
      });
      assert.equal(fetchCalls.length, 2);
      const a = fetchCalls[0].body.install_id;
      const b = fetchCalls[1].body.install_id;
      assert.equal(typeof a, "string");
      assert.equal(a, b);
      const cfg = join(home, ".agentskeptic", "config.json");
      const disk = JSON.parse(readFileSync(cfg, "utf8"));
      assert.equal(disk.install_id, a);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("fallback when .agentskeptic is a file: same install_id both phases", async () => {
    const home = mkdtempSync(join(tmpdir(), "as-install-fallback-"));
    try {
      setSandboxHome(home);
      delete process.env.AGENTSKEPTIC_TELEMETRY;
      writeFileSync(join(home, ".agentskeptic"), "not-a-directory", "utf8");
      const { resetCliInstallIdModuleStateForTests } = await import(
        "../dist/telemetry/cliInstallId.js"
      );
      resetCliInstallIdModuleStateForTests();
      const { postProductActivationEvent } = await import(
        "../dist/telemetry/postProductActivationEvent.js"
      );
      const issued = new Date().toISOString();
      await postProductActivationEvent({
        phase: "verify_started",
        run_id: "run-fb-1",
        issued_at: issued,
        workload_class: "non_bundled",
        workflow_lineage: "integrator_scoped",
        subcommand: "batch_verify",
        build_profile: "oss",
      });
      await postProductActivationEvent({
        phase: "verify_outcome",
        run_id: "run-fb-1",
        issued_at: issued,
        workload_class: "non_bundled",
        workflow_lineage: "integrator_scoped",
        subcommand: "batch_verify",
        build_profile: "oss",
        terminal_status: "complete",
      });
      assert.equal(fetchCalls.length, 2);
      assert.equal(fetchCalls[0].body.install_id, fetchCalls[1].body.install_id);
      assert.equal(existsSync(join(home, ".agentskeptic", "config.json")), false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("invalid JSON on disk: overwrites with valid id; both phases match", async () => {
    const home = mkdtempSync(join(tmpdir(), "as-install-badjson-"));
    try {
      setSandboxHome(home);
      delete process.env.AGENTSKEPTIC_TELEMETRY;
      mkdirSync(join(home, ".agentskeptic"), { recursive: true });
      writeFileSync(join(home, ".agentskeptic", "config.json"), "{ not json", "utf8");
      const { resetCliInstallIdModuleStateForTests } = await import(
        "../dist/telemetry/cliInstallId.js"
      );
      resetCliInstallIdModuleStateForTests();
      const { postProductActivationEvent } = await import(
        "../dist/telemetry/postProductActivationEvent.js"
      );
      const issued = new Date().toISOString();
      await postProductActivationEvent({
        phase: "verify_started",
        run_id: "run-bad-1",
        issued_at: issued,
        workload_class: "non_bundled",
        workflow_lineage: "integrator_scoped",
        subcommand: "batch_verify",
        build_profile: "oss",
      });
      await postProductActivationEvent({
        phase: "verify_outcome",
        run_id: "run-bad-1",
        issued_at: issued,
        workload_class: "non_bundled",
        workflow_lineage: "integrator_scoped",
        subcommand: "batch_verify",
        build_profile: "oss",
        terminal_status: "complete",
      });
      const id = fetchCalls[0].body.install_id;
      assert.equal(fetchCalls[1].body.install_id, id);
      const cfg = join(home, ".agentskeptic", "config.json");
      const disk = JSON.parse(readFileSync(cfg, "utf8"));
      assert.equal(disk.install_id, id);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("empty object on disk: mints and persists; both phases match", async () => {
    const home = mkdtempSync(join(tmpdir(), "as-install-empty-"));
    try {
      setSandboxHome(home);
      delete process.env.AGENTSKEPTIC_TELEMETRY;
      mkdirSync(join(home, ".agentskeptic"), { recursive: true });
      writeFileSync(join(home, ".agentskeptic", "config.json"), "{}", "utf8");
      const { resetCliInstallIdModuleStateForTests } = await import(
        "../dist/telemetry/cliInstallId.js"
      );
      resetCliInstallIdModuleStateForTests();
      const { postProductActivationEvent } = await import(
        "../dist/telemetry/postProductActivationEvent.js"
      );
      const issued = new Date().toISOString();
      await postProductActivationEvent({
        phase: "verify_started",
        run_id: "run-empty-1",
        issued_at: issued,
        workload_class: "non_bundled",
        workflow_lineage: "integrator_scoped",
        subcommand: "batch_verify",
        build_profile: "oss",
      });
      await postProductActivationEvent({
        phase: "verify_outcome",
        run_id: "run-empty-1",
        issued_at: issued,
        workload_class: "non_bundled",
        workflow_lineage: "integrator_scoped",
        subcommand: "batch_verify",
        build_profile: "oss",
        terminal_status: "complete",
      });
      assert.equal(fetchCalls[0].body.install_id, fetchCalls[1].body.install_id);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("non-UUID install_id string on disk: mints and overwrites; both phases match", async () => {
    const home = mkdtempSync(join(tmpdir(), "as-install-baduuid-"));
    try {
      setSandboxHome(home);
      delete process.env.AGENTSKEPTIC_TELEMETRY;
      mkdirSync(join(home, ".agentskeptic"), { recursive: true });
      writeFileSync(
        join(home, ".agentskeptic", "config.json"),
        JSON.stringify({ install_id: "not-a-uuid" }),
        "utf8",
      );
      const { resetCliInstallIdModuleStateForTests } = await import(
        "../dist/telemetry/cliInstallId.js"
      );
      resetCliInstallIdModuleStateForTests();
      const { postProductActivationEvent } = await import(
        "../dist/telemetry/postProductActivationEvent.js"
      );
      const issued = new Date().toISOString();
      await postProductActivationEvent({
        phase: "verify_started",
        run_id: "run-baduuid-1",
        issued_at: issued,
        workload_class: "non_bundled",
        workflow_lineage: "integrator_scoped",
        subcommand: "batch_verify",
        build_profile: "oss",
      });
      await postProductActivationEvent({
        phase: "verify_outcome",
        run_id: "run-baduuid-1",
        issued_at: issued,
        workload_class: "non_bundled",
        workflow_lineage: "integrator_scoped",
        subcommand: "batch_verify",
        build_profile: "oss",
        terminal_status: "complete",
      });
      const id = fetchCalls[0].body.install_id;
      assert.match(id, /^[0-9a-f-]{36}$/i);
      assert.equal(fetchCalls[1].body.install_id, id);
      const disk = JSON.parse(readFileSync(join(home, ".agentskeptic", "config.json"), "utf8"));
      assert.equal(disk.install_id, id);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
