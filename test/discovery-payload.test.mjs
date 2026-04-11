/**
 * Discovery payload contract: normalization, renders, truncation, upsert selection.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const require = createRequire(import.meta.url);
const dp = require(join(root, "scripts", "discovery-payload.lib.cjs"));

const fixturePath = join(root, "test", "fixtures", "discovery-payload", "v1.json");
const goldenSummary = join(root, "test", "golden", "discovery-ci-summary.md");
const goldenPr = join(root, "test", "golden", "discovery-ci-pr-body.md");
const goldenCreate = join(root, "test", "golden", "github-issues-create-comment.json");

function loadFixture() {
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

test("fixture matches live buildDiscoveryPayload (no drift)", () => {
  const live = dp.buildDiscoveryPayload(root);
  const fixture = loadFixture();
  assert.deepEqual(fixture, live);
});

test("normalizeDiscoveryText: CRLF to LF and single trailing newline", () => {
  const a = dp.normalizeDiscoveryText("a\r\nb\r\n");
  assert.equal(a, "a\nb\n");
  assert.equal(a.endsWith("\n"), true);
  assert.equal(a.split("\n").length, 3);
});

test("tailLines returns last 20 of 40", () => {
  const lines = Array.from({ length: 40 }, (_, i) => `L${i + 1}`).join("\n");
  const t = dp.tailLines(lines, 20);
  assert.equal(t.length, 20);
  assert.equal(t[0], "L21");
  assert.equal(t[19], "L40");
});

test("renderCiSummaryMarkdownFromPayload matches golden", () => {
  const out = dp.renderCiSummaryMarkdownFromPayload(loadFixture());
  assert.equal(out, readFileSync(goldenSummary, "utf8"));
});

test("renderCiPrBodyFromPayload empty capture matches golden", () => {
  const out = dp.renderCiPrBodyFromPayload(loadFixture(), {
    stderrText: "",
    workflowStdoutText: "",
  });
  assert.equal(out, readFileSync(goldenPr, "utf8"));
  assert.ok(out.includes(dp.PR_MARKER_LINE));
});

test("GitHub createComment envelope matches golden", () => {
  const body = dp.renderCiPrBodyFromPayload(loadFixture(), {
    stderrText: "",
    workflowStdoutText: "",
  });
  const env = JSON.stringify({ body }, null, 2) + "\n";
  assert.equal(env, readFileSync(goldenCreate, "utf8"));
});

test("llms.txt normalized equals renderLlmsTextFromPayload(build)", () => {
  const payload = dp.buildDiscoveryPayload(root);
  const rendered = dp.renderLlmsTextFromPayload(payload);
  const onDisk = readFileSync(join(root, "llms.txt"), "utf8");
  assert.equal(dp.normalizeDiscoveryText(onDisk), rendered);
});

test("rendered llms includes When this hurts demand section", () => {
  const payload = dp.buildDiscoveryPayload(root);
  const rendered = dp.renderLlmsTextFromPayload(payload);
  assert.ok(rendered.includes("## When this hurts (search-shaped)"));
  for (const line of payload.appendix.demandMoments) {
    assert.ok(rendered.includes(line), line);
  }
});

test("assertUtf8ByteLength throws when over limit", () => {
  assert.throws(() => dp.assertUtf8ByteLength("x", "y", 0), /exceeds max/);
});

test("summary markdown exceeds 65KB throws", () => {
  const fx = loadFixture();
  const huge = {
    ...fx,
    identityOneLiner: "x".repeat(70_000),
  };
  assert.throws(() => dp.renderCiSummaryMarkdownFromPayload(huge), /exceeds max/);
});

test("PR body truncates stderr from start until under 10KB", () => {
  const fx = loadFixture();
  const bigStderr = Array.from({ length: 500 }, (_, i) => `E${i} `.repeat(40)).join("\n");
  const out = dp.renderCiPrBodyFromPayload(fx, {
    stderrText: bigStderr,
    workflowStdoutText: '{"x":1}',
  });
  assert.ok(dp.utf8ByteLength(out) <= dp.MAX_PR_BODY_UTF8_BYTES);
  assert.ok(out.includes(dp.PR_MARKER_LINE));
});

test("selectPrCommentUpsert: create when no marker", () => {
  const r = dp.selectPrCommentUpsert([{ id: 1, body: "hello" }], dp.PR_MARKER_LINE);
  assert.deepEqual(r, { action: "create" });
});

test("selectPrCommentUpsert: update newest with marker", () => {
  const r = dp.selectPrCommentUpsert(
    [
      { id: 1, body: `old ${dp.PR_MARKER_LINE}` },
      { id: 2, body: "noise" },
      { id: 3, body: `newer ${dp.PR_MARKER_LINE}` },
    ],
    dp.PR_MARKER_LINE,
  );
  assert.deepEqual(r, { action: "update", id: 3 });
});

test("render-discovery-ci.mjs summary prints golden", () => {
  const r = spawnSync(process.execPath, [join(root, "scripts", "render-discovery-ci.mjs"), "summary"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, WFV_REPO_ROOT: root },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, readFileSync(goldenSummary, "utf8"));
});

test("render-discovery-ci.mjs pr_body with empty files", () => {
  const dir = mkdtempSync(join(tmpdir(), "wfv-rd-"));
  const e = join(dir, "e.txt");
  const o = join(dir, "o.txt");
  writeFileSync(e, "", "utf8");
  writeFileSync(o, "", "utf8");
  try {
    const r = spawnSync(
      process.execPath,
      [
        join(root, "scripts", "render-discovery-ci.mjs"),
        "pr_body",
        "--stderr-file",
        e,
        "--workflow-stdout-file",
        o,
      ],
      { cwd: root, encoding: "utf8", env: { ...process.env, WFV_REPO_ROOT: root } },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, readFileSync(goldenPr, "utf8"));
  } finally {
    unlinkSync(e);
    unlinkSync(o);
  }
});

test("render-discovery-ci.mjs exits 2 on bad argv", () => {
  const r = spawnSync(process.execPath, [join(root, "scripts", "render-discovery-ci.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.ok((r.stderr + r.stdout).toLowerCase().includes("usage") || r.stderr.includes("Usage"));
});

test("examples/github-actions/workflow-verifier-commercial.yml references PR marker", () => {
  const yml = readFileSync(join(root, "examples", "github-actions", "workflow-verifier-commercial.yml"), "utf8");
  assert.ok(yml.includes(dp.PR_MARKER_LINE));
});
