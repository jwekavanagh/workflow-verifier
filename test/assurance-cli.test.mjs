/**
 * workflow-verifier assurance run | stale: manifest sweep, staleness, failure modes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "child_process";
import { loadSchemaValidator } from "../dist/schemaLoad.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliJs = join(root, "dist", "cli.js");
const committedManifest = join(root, "examples", "assurance", "manifest.json");
const minimalCi = join(root, "examples", "minimal-ci-enforcement");
const mismatchPrior = join(root, "test", "fixtures", "assurance", "compare-mismatch-prior.json");
const mismatchCurrent = join(root, "test", "fixtures", "assurance", "compare-mismatch-current.json");

function runAssurance(args) {
  return spawnSync(
    process.execPath,
    ["--no-warnings", cliJs, "assurance", ...args],
    { encoding: "utf8", cwd: root },
  );
}

describe("assurance CLI", () => {
  it("assurance run with committed manifest exits 0 and emits valid report", () => {
    const r = runAssurance(["run", "--manifest", committedManifest]);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const line = r.stdout.trim().split(/\r?\n/).filter((l) => l.length > 0).pop();
    const rep = JSON.parse(line);
    const v = loadSchemaValidator("assurance-run-report-v1");
    assert.equal(v(rep), true, JSON.stringify(v.errors ?? []));
    assert.equal(rep.schemaVersion, 1);
    assert.equal(rep.scenarios.length, 2);
    assert.ok(rep.scenarios.every((s) => s.exitCode === 0));
  });

  it("assurance stale exits 1 when issuedAt is too old", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-as-stale-"));
    try {
      const p = join(dir, "report.json");
      writeFileSync(
        p,
        JSON.stringify({
          schemaVersion: 1,
          issuedAt: "2000-01-01T00:00:00.000Z",
          scenarios: [{ id: "x", exitCode: 0 }],
        }),
        "utf8",
      );
      const r = runAssurance(["stale", "--report", p, "--max-age-hours", "24"]);
      assert.equal(r.status, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("assurance stale exits 3 when report path missing", () => {
    const r = runAssurance([
      "stale",
      "--report",
      join(root, "this-path-does-not-exist-assurance.json"),
      "--max-age-hours",
      "1",
    ]);
    assert.equal(r.status, 3);
    const err = JSON.parse(r.stderr.trim());
    assert.equal(err.code, "ASSURANCE_REPORT_READ_FAILED");
  });

  it("assurance stale exits 3 on malformed JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-as-bad-"));
    try {
      const p = join(dir, "bad.json");
      writeFileSync(p, "{", "utf8");
      const r = runAssurance(["stale", "--report", p, "--max-age-hours", "24"]);
      assert.equal(r.status, 3);
      const err = JSON.parse(r.stderr.trim());
      assert.equal(err.code, "ASSURANCE_REPORT_JSON_SYNTAX");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("assurance run exits 3 when manifest references missing path", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-as-miss-"));
    try {
      const mpath = join(dir, "manifest.json");
      writeFileSync(
        mpath,
        JSON.stringify({
          schemaVersion: 1,
          scenarios: [
            {
              id: "bad",
              kind: "spawn_argv",
              argv: ["compare", "--prior", "nope-not-a-file.json", "--current", mismatchCurrent],
            },
          ],
        }),
        "utf8",
      );
      const r = runAssurance(["run", "--manifest", mpath]);
      assert.equal(r.status, 3);
      const err = JSON.parse(r.stderr.trim());
      assert.equal(err.code, "ASSURANCE_MANIFEST_PATH_MISSING");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("assurance run exits 1 when enforce expect-lock does not match", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-as-lock-"));
    try {
      const badLock = join(dir, "bad.ci-lock-v1.json");
      const goodLock = join(minimalCi, "wf_complete.ci-lock-v1.json");
      let lockText = readFileSync(goodLock, "utf8");
      lockText = lockText.replace('"workflowId":"wf_complete"', '"workflowId":"wf_other"');
      writeFileSync(badLock, lockText, "utf8");
      const mpath = join(dir, "manifest.json");
      writeFileSync(
        mpath,
        JSON.stringify({
          schemaVersion: 1,
          scenarios: [
            {
              id: "broken_enforce",
              kind: "spawn_argv",
              argv: [
                "enforce",
                "batch",
                "--workflow-id",
                "wf_complete",
                "--events",
                join(minimalCi, "events.ndjson"),
                "--registry",
                join(minimalCi, "tools.json"),
                "--db",
                join(minimalCi, "ci-check.sqlite"),
                "--no-truth-report",
                "--expect-lock",
                badLock,
              ],
            },
          ],
        }),
        "utf8",
      );
      const r = runAssurance(["run", "--manifest", mpath]);
      assert.equal(r.status, 1);
      const line = r.stdout.trim().split(/\r?\n/).filter((l) => l.length > 0).pop();
      const rep = JSON.parse(line);
      assert.equal(rep.scenarios.length, 1);
      assert.notEqual(rep.scenarios[0].exitCode, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("assurance run exits 1 when compare workflowId mismatch", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-as-cmp-"));
    try {
      const mpath = join(dir, "manifest.json");
      writeFileSync(
        mpath,
        JSON.stringify({
          schemaVersion: 1,
          scenarios: [
            {
              id: "mismatch_compare",
              kind: "spawn_argv",
              argv: [
                "compare",
                "--prior",
                mismatchPrior,
                "--current",
                mismatchCurrent,
              ],
            },
          ],
        }),
        "utf8",
      );
      const r = runAssurance(["run", "--manifest", mpath]);
      assert.equal(r.status, 1);
      const line = r.stdout.trim().split(/\r?\n/).filter((l) => l.length > 0).pop();
      const rep = JSON.parse(line);
      assert.equal(rep.scenarios[0].exitCode, 3);
      assert.equal(rep.scenarios[0].id, "mismatch_compare");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("assurance run --write-report writes schema-valid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "etl-as-wr-"));
    try {
      const out = join(dir, "out.json");
      const r = runAssurance(["run", "--manifest", committedManifest, "--write-report", out]);
      assert.equal(r.status, 0, r.stderr);
      const rep = JSON.parse(readFileSync(out, "utf8"));
      const v = loadSchemaValidator("assurance-run-report-v1");
      assert.equal(v(rep), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
