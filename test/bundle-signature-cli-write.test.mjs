/**
 * workflow-verifier --write-run-bundle + --sign-ed25519-private-key emits v2 bundle; verify-bundle-signature OK.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { normalizeSpkiPemForSidecar } from "../dist/workflowResultSignature.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliJs = join(root, "dist", "cli.js");

describe("CLI signed run bundle", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "etl-bundle-sig-cli-"));
    dbPath = join(dir, "test.db");
    const sql = readFileSync(join(root, "examples", "seed.sql"), "utf8");
    const db = new DatabaseSync(dbPath);
    db.exec(sql);
    db.close();
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("workflow-verifier with signing writes v2; sidecar hash matches; verify-bundle-signature exits 0", () => {
    const eventsPath = join(root, "examples", "events.ndjson");
    const registryPath = join(root, "examples", "tools.json");
    const wfId = "wf_complete";
    const bundleParent = mkdtempSync(join(tmpdir(), "etl-signed-out-"));
    const outDir = join(bundleParent, wfId);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
    const publicPem = publicKey.export({ type: "spki", format: "pem" });
    const privatePath = join(bundleParent, "priv.pem");
    const publicPath = join(bundleParent, "pub.pem");
    writeFileSync(privatePath, privatePem, "utf8");
    writeFileSync(publicPath, normalizeSpkiPemForSidecar(String(publicPem)), "utf8");
    try {
      const r = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          cliJs,
          "--workflow-id",
          wfId,
          "--events",
          eventsPath,
          "--registry",
          registryPath,
          "--db",
          dbPath,
          "--no-truth-report",
          "--write-run-bundle",
          outDir,
          "--sign-ed25519-private-key",
          privatePath,
        ],
        { encoding: "utf8", cwd: root },
      );
      assert.ok(r.status === 0 || r.status === 1 || r.status === 2, `unexpected exit ${r.status}: ${r.stderr}`);
      assert.notEqual(r.status, 3, r.stderr);

      const manifest = JSON.parse(readFileSync(join(outDir, "agent-run.json"), "utf8"));
      assert.equal(manifest.schemaVersion, 2);
      assert.equal(manifest.artifacts.workflowResultSignature.relativePath, "workflow-result.sig.json");

      const wrBytes = readFileSync(join(outDir, "workflow-result.json"));
      const expectedHex = createHash("sha256").update(wrBytes).digest("hex");
      const sidecar = JSON.parse(readFileSync(join(outDir, "workflow-result.sig.json"), "utf8"));
      assert.equal(typeof sidecar.algorithm, "string");
      assert.equal(typeof sidecar.signatureBase64, "string");
      assert.equal(typeof sidecar.signingPublicKeySpkiPem, "string");
      assert.equal(sidecar.schemaVersion, 1);
      assert.equal(sidecar.signedContentSha256Hex, expectedHex);

      const v = spawnSync(
        process.execPath,
        ["--no-warnings", cliJs, "verify-bundle-signature", "--run-dir", outDir, "--public-key", publicPath],
        { encoding: "utf8", cwd: root },
      );
      assert.equal(v.status, 0, v.stderr);
    } finally {
      rmSync(bundleParent, { recursive: true, force: true });
    }
  });
});
