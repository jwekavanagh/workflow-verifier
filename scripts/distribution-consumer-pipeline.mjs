#!/usr/bin/env node
/**
 * Cross-repo distribution consumer pipeline (P1–P8).
 * @see docs/public-distribution-ssot.md
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** @param {string} code @param {string} message @returns {never} */
function fail(code, message) {
  const line = JSON.stringify({ distributionPipeline: true, code, message });
  console.error(line);
  process.exit(1);
}

/** @param {string} yamlUtf8 */
export function stripForeignSmokeBodyForHash(yamlUtf8) {
  let s = yamlUtf8;
  // Remove job-level env block that only carries the strip-hash literal (see SSOT).
  s = s.replace(/\r?\n[ \t]+env:[ \t]*\r?\n[ \t]+FOREIGN_SMOKE_FIXTURE_SHA256:[^\r\n]*/g, "");
  const lines = s.split(/\r?\n/);
  const kept = lines.filter((ln) => !ln.trimStart().startsWith("FOREIGN_SMOKE_FIXTURE_SHA256:"));
  return kept.join("\n");
}

/** @param {string} fullYaml */
export function fixtureSha256FromFullYaml(fullYaml) {
  return createHash("sha256").update(stripForeignSmokeBodyForHash(fullYaml), "utf8").digest("hex");
}

/**
 * @param {string} iso
 * @returns {number}
 */
export function githubCreatedAtToMs(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw new Error(`invalid createdAt: ${iso}`);
  return t;
}

/**
 * @param {Array<{ databaseId: string, name: string, createdAt: string, status: string, conclusion: string | null }>} runs
 * @param {string} expectedName
 * @param {number} tWindowStartMs
 * @returns {typeof runs[0] | null}
 */
export function selectProofRun(runs, expectedName, tWindowStartMs) {
  const inWin = runs.filter(
    (r) => r.name === expectedName && githubCreatedAtToMs(r.createdAt) >= tWindowStartMs,
  );
  const successes = inWin.filter((r) => r.conclusion === "success");
  if (successes.length === 0) return null;
  successes.sort((a, b) => {
    const ca = githubCreatedAtToMs(a.createdAt);
    const cb = githubCreatedAtToMs(b.createdAt);
    if (cb !== ca) return cb - ca;
    return Number(BigInt(b.databaseId) - BigInt(a.databaseId));
  });
  return successes[0] ?? null;
}

/**
 * @param {{ cEmptyEveryPoll: boolean, sawInWindowSuccessWrongName: boolean }} s
 * @returns {"STALE_SUCCESS_IGNORED" | "NO_RUN_WITHIN_POLL"}
 */
export function classifyPollTimeoutWithoutR(s) {
  if (s.cEmptyEveryPoll && s.sawInWindowSuccessWrongName) return "STALE_SUCCESS_IGNORED";
  return "NO_RUN_WITHIN_POLL";
}

/**
 * @param {unknown} parsed
 * @param {{ correlationId: string, verifierSha: string, fixtureSha256: string }} expected
 * @returns {"CORRELATION_PROOF_MISMATCH" | "VERIFIER_SHA_PROOF_MISMATCH" | "FIXTURE_HASH_PROOF_MISMATCH" | null}
 */
export function validateProofJson(parsed, expected) {
  if (!parsed || typeof parsed !== "object") return "PROOF_ARTIFACT_MISMATCH";
  const o = /** @type {Record<string, unknown>} */ (parsed);
  const keys = new Set(Object.keys(o));
  const need = new Set(["correlation_id", "verifier_sha", "foreign_smoke_fixture_sha256"]);
  if (keys.size !== need.size || [...need].some((k) => !keys.has(k))) return "PROOF_ARTIFACT_MISMATCH";
  if (o.correlation_id !== expected.correlationId) return "CORRELATION_PROOF_MISMATCH";
  if (o.verifier_sha !== expected.verifierSha) return "VERIFIER_SHA_PROOF_MISMATCH";
  if (o.foreign_smoke_fixture_sha256 !== expected.fixtureSha256) return "FIXTURE_HASH_PROOF_MISMATCH";
  return null;
}

/**
 * @param {string} tmpDownloadDir parent of `distribution-proof/`
 */
export function assertProofArtifactLayout(tmpDownloadDir) {
  const top = readdirSync(tmpDownloadDir);
  if (top.length !== 1 || top[0] !== "distribution-proof") {
    fail("PROOF_ARTIFACT_MISMATCH", "download directory must contain only distribution-proof/");
  }
  const innerDir = join(tmpDownloadDir, "distribution-proof");
  const inner = readdirSync(innerDir);
  if (inner.length !== 1 || inner[0] !== "proof.json") {
    fail("PROOF_ARTIFACT_MISMATCH", "distribution-proof must contain only proof.json");
  }
}

/**
 * @param {{ gitRepositoryUrl: string, distributionConsumerRepository: string }} anchors
 */
export function parsePrimaryRepoFromAnchors(anchors) {
  const u = String(anchors.gitRepositoryUrl);
  const m = u.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!m) fail("CONSUMER_GET_FAILED", `cannot parse primary repo from gitRepositoryUrl: ${u}`);
  return { owner: m[1], repo: m[2].replace(/\.git$/i, "") };
}

/**
 * @param {{ owner: string, repo: string }} primary
 */
export function buildForeignSmokeWorkflowYaml(primary) {
  const repoFull = `${primary.owner}/${primary.repo}`;
  const bodyNoEnv = [
    "name: foreign-smoke",
    "run-name: distribution-consumer-${{ inputs.correlation_id }}",
    "",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      verifier_sha:",
    "        required: true",
    "        type: string",
    "      correlation_id:",
    "        required: true",
    "        type: string",
    "",
    "jobs:",
    "  foreign-smoke:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "        with:",
    `          repository: ${repoFull}`,
    "          ref: ${{ inputs.verifier_sha }}",
    "          path: primary",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: \"22\"",
    "      - name: Install and verify",
    "        id: verify",
    "        working-directory: primary",
    "        run: |",
    "          npm ci",
    "          node --input-type=module -e \"",
    "          import { readFileSync } from 'node:fs';",
    "          import { DatabaseSync } from 'node:sqlite';",
    "          const db = new DatabaseSync('examples/demo.db');",
    "          db.exec(readFileSync('examples/seed.sql','utf8'));",
    "          db.close();",
    "          \"",
    "          npx --yes workflow-verifier@latest --workflow-id wf_complete \\",
    "            --events examples/events.ndjson \\",
    "            --registry examples/tools.json \\",
    "            --db examples/demo.db \\",
    "            --no-truth-report",
    "      - name: Write proof.json",
    "        if: success()",
    "        working-directory: primary",
    "        env:",
    "          CORRELATION_ID: ${{ inputs.correlation_id }}",
    "          VERIFIER_SHA_IN: ${{ inputs.verifier_sha }}",
    "          FX_SHA: ${{ env.FOREIGN_SMOKE_FIXTURE_SHA256 }}",
    "        run: |",
    "          node --input-type=module -e \"",
    "          import { writeFileSync } from 'node:fs';",
    "          const j = {",
    "            correlation_id: process.env.CORRELATION_ID,",
    "            verifier_sha: process.env.VERIFIER_SHA_IN,",
    "            foreign_smoke_fixture_sha256: process.env.FX_SHA,",
    "          };",
    "          writeFileSync('proof.json', JSON.stringify(j));",
    "          \"",
    "      - name: Upload proof",
    "        if: success()",
    "        uses: actions/upload-artifact@v4",
    "        with:",
    "          name: distribution-proof",
    "          path: primary/proof.json",
    "",
  ].join("\n");

  const hash = createHash("sha256").update(bodyNoEnv, "utf8").digest("hex");
  const withEnv = bodyNoEnv.replace(
    "    runs-on: ubuntu-latest\n    steps:",
    [
      "    runs-on: ubuntu-latest",
      "    env:",
      `      FOREIGN_SMOKE_FIXTURE_SHA256: "${hash}"`,
      "    steps:",
    ].join("\n"),
  );

  const stripped = stripForeignSmokeBodyForHash(withEnv);
  if (stripped !== bodyNoEnv) {
    let idx = 0;
    const m = Math.min(stripped.length, bodyNoEnv.length);
    while (idx < m && stripped[idx] === bodyNoEnv[idx]) idx++;
    fail(
      "FIXTURE_HASH_INJECTION_FAILED",
      `strip-hash body mismatch at ${idx}: got ${JSON.stringify(stripped.slice(idx, idx + 120))} expected ${JSON.stringify(bodyNoEnv.slice(idx, idx + 120))}`,
    );
  }
  const check = createHash("sha256").update(stripped, "utf8").digest("hex");
  if (check !== hash) fail("FIXTURE_HASH_INJECTION_FAILED", "strip-hash recomputation mismatch after inject");
  return { yaml: withEnv, fixtureSha256: hash };
}

function loadAnchorsJson() {
  const p = join(ROOT, "config", "public-product-anchors.json");
  const raw = readFileSync(p, "utf8");
  return JSON.parse(raw);
}

/**
 * @param {string[]} args
 * @param {string} token
 * @param {Record<string, string>} [extraEnv]
 */
function gh(args, token, extraEnv = {}) {
  const env = { ...process.env, GH_TOKEN: token, ...extraEnv };
  const r = spawnSync("gh", args, { encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** `gh` uses exit code 1 for HTTP 404; never compare `status === 404`. */
function ghOutputLooksLikeNotFound(stderr, stdout) {
  const t = `${stderr || ""}${stdout || ""}`;
  return /HTTP\s+404|Not Found/i.test(t);
}

/**
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 */
function ghGetDefaultBranch(token, owner, repo) {
  const res = gh(["api", `repos/${owner}/${repo}`, "--jq", ".default_branch"], token);
  if (res.status !== 0) fail("CONSUMER_GET_FAILED", res.stderr || res.stdout);
  return String(res.stdout ?? "").trim() || "main";
}

/**
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 */
function ghGetActionsEnabled(token, owner, repo) {
  const res = gh(["api", `repos/${owner}/${repo}/actions/permissions`, "--jq", ".enabled"], token);
  if (res.status !== 0) return null;
  return String(res.stdout ?? "").trim() === "true";
}

/**
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string} path
 * @param {string} ref
 * @returns {{ content: string, sha?: string } | null}
 */
function encodeContentPath(path) {
  return path
    .split("/")
    .filter((s) => s.length > 0)
    .map(encodeURIComponent)
    .join("/");
}

function ghGetContentsFile(token, owner, repo, path, ref) {
  const enc = encodeContentPath(path);
  const res = gh(
    ["api", `repos/${owner}/${repo}/contents/${enc}?ref=${encodeURIComponent(ref)}`],
    token,
  );
  if (res.status === 404) return null;
  if (res.status !== 0) fail("CONSUMER_GET_FAILED", res.stderr || res.stdout);
  const j = JSON.parse(res.stdout);
  if (j.type !== "file" || typeof j.content !== "string") fail("CONSUMER_GET_FAILED", "unexpected contents payload");
  const buf = Buffer.from(j.content.replace(/\n/g, ""), "base64");
  return { content: buf.toString("utf8"), sha: typeof j.sha === "string" ? j.sha : undefined };
}

/**
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string} path
 * @param {string} message
 * @param {string} utf8
 * @param {string | undefined} sha
 */
function ghPutContentsFile(token, owner, repo, path, message, utf8, sha) {
  const content = Buffer.from(utf8, "utf8").toString("base64");
  /** @type {Record<string, unknown>} */
  const body = { message, content, branch: "main" };
  if (sha) body.sha = sha;
  const enc = encodeContentPath(path);
  const r2 = spawnSync("gh", ["api", "-X", "PUT", `repos/${owner}/${repo}/contents/${enc}`, "--input", "-"], {
    encoding: "utf8",
    input: JSON.stringify(body),
    env: { ...process.env, GH_TOKEN: token },
  });
  if ((r2.status ?? 1) !== 0) fail("WORKFLOW_PUT_FAILED", r2.stderr || r2.stdout);
  return JSON.parse(r2.stdout || "{}");
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * @param {string} token
 * @param {string} consumerFull
 * @param {string} workflowFile
 */
function ghWorkflowViewWithRetry(token, consumerFull, workflowFile) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const res = gh(["workflow", "view", workflowFile, "--repo", consumerFull], token);
    if (res.status === 0) return;
    sleepMs(5000);
  }
  fail("WORKFLOW_NOT_INDEXED", `gh workflow view ${workflowFile} did not succeed within 120s`);
}

/**
 * @param {string} token
 * @param {string} consumerFull
 * @param {string} workflowFile
 * @param {Record<string, string>} inputs
 */
function ghWorkflowRun(token, consumerFull, workflowFile, inputs) {
  const args = ["workflow", "run", workflowFile, "--repo", consumerFull];
  for (const [k, v] of Object.entries(inputs)) {
    args.push("-f", `${k}=${v}`);
  }
  const res = gh(args, token);
  if (res.status !== 0) fail("DISPATCH_NOT_ACCEPTED", res.stderr || res.stdout);
}

/**
 * @param {string} token
 * @param {string} consumerFull
 * @returns {Array<{ databaseId: string, name: string, createdAt: string, status: string, conclusion: string | null }>}
 */
function ghRunList(token, consumerFull) {
  const res = gh(
    [
      "run",
      "list",
      "--repo",
      consumerFull,
      "--workflow",
      "foreign-smoke.yml",
      "--event",
      "workflow_dispatch",
      "--json",
      "databaseId,name,createdAt,status,conclusion",
      "--limit",
      "100",
    ],
    token,
  );
  if (res.status !== 0) fail("CONSUMER_GET_FAILED", res.stderr || res.stdout);
  return JSON.parse(res.stdout || "[]");
}

/**
 * @param {string} token
 * @param {string} consumerFull
 * @param {string} databaseId
 * @param {string} destDir
 */
function ghRunDownload(token, consumerFull, databaseId, destDir) {
  const res = gh(
    [
      "run",
      "download",
      databaseId,
      "--repo",
      consumerFull,
      "-n",
      "distribution-proof",
      "-D",
      destDir,
    ],
    token,
  );
  if (res.status !== 0) fail("PROOF_ARTIFACT_DOWNLOAD_FAILED", res.stderr || res.stdout);
}

export function runDistributionConsumerPipeline() {
  const anchors = loadAnchorsJson();
  const consumerFull = anchors.distributionConsumerRepository;
  if (!consumerFull || typeof consumerFull !== "string" || !consumerFull.includes("/")) {
    fail("CONSUMER_GET_FAILED", "config/public-product-anchors.json: missing distributionConsumerRepository");
  }
  const [cOwner, cRepo] = consumerFull.split("/");
  const distributionToken = (process.env.DISTRIBUTION_GITHUB_TOKEN || "").trim();
  if (process.env.GITHUB_ACTIONS === "true" && !distributionToken) {
    fail(
      "CONSUMER_GET_FAILED",
      "DISTRIBUTION_GITHUB_TOKEN repository secret is required in GitHub Actions. The default GITHUB_TOKEN is scoped to this repository only and cannot read or update the distribution consumer repository.",
    );
  }
  const token = distributionToken || (process.env.GITHUB_TOKEN || "").trim();
  if (!token) fail("CONSUMER_GET_FAILED", "GITHUB_TOKEN or DISTRIBUTION_GITHUB_TOKEN required");

  const primary =
    process.env.GITHUB_REPOSITORY?.includes("/") ?
      (() => {
        const [o, r] = String(process.env.GITHUB_REPOSITORY).split("/");
        return { owner: o, repo: r };
      })()
    : parsePrimaryRepoFromAnchors(anchors);

  const resRepo = gh(["api", `repos/${cOwner}/${cRepo}`], token);
  if (resRepo.status !== 0) {
    if (ghOutputLooksLikeNotFound(resRepo.stderr, resRepo.stdout)) {
      fail(
        "CONSUMER_GET_FAILED",
        `consumer repo not found or not accessible with this token: ${consumerFull}. Confirm the repo exists and DISTRIBUTION_GITHUB_TOKEN has Contents and Actions (workflow) access on that repository.`,
      );
    }
    fail("CONSUMER_GET_FAILED", resRepo.stderr || resRepo.stdout);
  }

  const def = ghGetDefaultBranch(token, cOwner, cRepo);
  if (def !== "main") fail("CONSUMER_DEFAULT_BRANCH_NOT_MAIN", `expected main, got ${def}`);

  const act0 = ghGetActionsEnabled(token, cOwner, cRepo);
  if (act0 !== true) fail("CONSUMER_ACTIONS_DISABLED", "Actions not enabled on consumer");

  const { yaml: workflowYaml, fixtureSha256: FIXTURE_SHA256 } = buildForeignSmokeWorkflowYaml(primary);
  const path = ".github/workflows/foreign-smoke.yml";
  const existing = ghGetContentsFile(token, cOwner, cRepo, path, "main");
  const putRes = ghPutContentsFile(
    token,
    cOwner,
    cRepo,
    path,
    "chore: sync foreign-smoke distribution gate",
    workflowYaml,
    existing?.sha,
  );

  const afterPut = ghGetContentsFile(token, cOwner, cRepo, path, "main");
  if (!afterPut || afterPut.content !== workflowYaml) fail("WORKFLOW_DRIFT_AFTER_PUT", "GET contents after PUT mismatch");

  const mainRef = gh(["api", `repos/${cOwner}/${cRepo}/git/ref/heads/main`], token);
  if (mainRef.status !== 0) fail("WORKFLOW_FIRST_COMMIT_BLOCKED", mainRef.stderr || mainRef.stdout);
  const mainSha = JSON.parse(mainRef.stdout).object?.sha;
  const commitSha = putRes.commit?.sha;
  if (typeof commitSha !== "string" || typeof mainSha !== "string" || commitSha !== mainSha) {
    fail("WORKFLOW_REF_MISMATCH", "PUT commit sha does not match refs/heads/main");
  }

  const preBody = ghGetContentsFile(token, cOwner, cRepo, path, "main");
  if (!preBody) fail("PRE_DISPATCH_CONTENT_HASH_MISMATCH", "missing workflow file after publish");
  const gotHash = fixtureSha256FromFullYaml(preBody.content);
  if (gotHash !== FIXTURE_SHA256) fail("PRE_DISPATCH_CONTENT_HASH_MISMATCH", "strip-hash of remote workflow != pipeline FIXTURE_SHA256");

  ghWorkflowViewWithRetry(token, consumerFull, "foreign-smoke.yml");

  const act1 = ghGetActionsEnabled(token, cOwner, cRepo);
  if (act1 !== true) fail("CONSUMER_ACTIONS_DISABLED_POST_PUBLISH", "Actions disabled after publish");

  let verifierSha = process.env.GITHUB_SHA?.trim() ?? "";
  if (!verifierSha) {
    const g = spawnSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" });
    if ((g.status ?? 1) === 0 && g.stdout?.trim()) verifierSha = g.stdout.trim();
  }
  if (!verifierSha) {
    fail("CONSUMER_GET_FAILED", "Cannot resolve verifier_sha: set GITHUB_SHA or use a git checkout");
  }
  const runId = process.env.GITHUB_RUN_ID || "local";
  const correlationId = `${process.env.GITHUB_REPOSITORY || `${primary.owner}/${primary.repo}`}#${runId}`;

  const T_DISPATCH_BEFORE = Date.now();
  const T_WINDOW_START_MS = T_DISPATCH_BEFORE - 5000;

  ghWorkflowRun(token, consumerFull, "foreign-smoke.yml", {
    verifier_sha: String(verifierSha).trim(),
    correlation_id: correlationId,
  });

  const expectedRunName = `distribution-consumer-${correlationId}`;
  let cEmptyEveryPoll = true;
  let sawInWindowSuccessWrongName = false;
  const pollDeadline = Date.now() + 900_000;

  while (Date.now() < pollDeadline) {
    const runs = ghRunList(token, consumerFull);
    for (const r of runs) {
      const ms = githubCreatedAtToMs(r.createdAt);
      if (ms >= T_WINDOW_START_MS && r.conclusion === "success" && r.name !== expectedRunName) {
        sawInWindowSuccessWrongName = true;
      }
    }
    const picked = selectProofRun(runs, expectedRunName, T_WINDOW_START_MS);
    if (picked) {
      const tmp = mkdtempSync(join(tmpdir(), "dist-proof-"));
      try {
        ghRunDownload(token, consumerFull, picked.databaseId, tmp);
        assertProofArtifactLayout(tmp);
        const proofPath = join(tmp, "distribution-proof", "proof.json");
        let parsed;
        try {
          parsed = JSON.parse(readFileSync(proofPath, "utf8"));
        } catch {
          fail("PROOF_ARTIFACT_MISMATCH", "proof.json is not valid JSON");
        }
        const err = validateProofJson(parsed, {
          correlationId,
          verifierSha: String(verifierSha).trim(),
          fixtureSha256: FIXTURE_SHA256,
        });
        if (err) fail(err, "proof.json field mismatch");
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
      console.log(
        JSON.stringify({
          distributionPipeline: true,
          code: "OK",
          message: "distribution consumer proof verified",
        }),
      );
      return;
    }
    const inC = runs.some(
      (r) => r.name === expectedRunName && githubCreatedAtToMs(r.createdAt) >= T_WINDOW_START_MS,
    );
    if (inC) cEmptyEveryPoll = false;
    sleepMs(15_000);
  }

  const code = classifyPollTimeoutWithoutR({ cEmptyEveryPoll, sawInWindowSuccessWrongName });
  fail(code, "polling timed out without successful proof run");
}

const entryFile = resolve(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === entryFile) {
  try {
    runDistributionConsumerPipeline();
  } catch (e) {
    console.error(
      JSON.stringify({
        distributionPipeline: true,
        code: "INTERNAL_ERROR",
        message: e instanceof Error ? e.message : String(e),
      }),
    );
    process.exit(1);
  }
}
