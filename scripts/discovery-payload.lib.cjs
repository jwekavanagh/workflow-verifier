"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

/**
 * Same origin normalization as public-product-anchors.cjs (duplicated to avoid circular require).
 * @param {string} s
 */
function normalizeOrigin(s) {
  const t = String(s).trim();
  if (!t) throw new Error("normalizeOrigin: empty origin");
  const u = new URL(t);
  return u.origin;
}

/** @type {const} */
const DISCOVERY_LLM_BRANCH = "main";

/** @type {const} */
const PR_MARKER_LINE = "<!-- agentskeptic-discovery:v1 -->";

/** @type {const} */
const PR_MARKER_LINE_LEGACY = "<!-- workflow-verifier-discovery:v1 -->";

const MAX_SUMMARY_UTF8_BYTES = 65536;
const MAX_PR_BODY_UTF8_BYTES = 10240;
const STDERR_TAIL_LINES = 20;

/**
 * @param {string} gitRepositoryUrl
 * @returns {{ owner: string, repo: string }}
 */
function parseGithubRepoFromUrl(gitRepositoryUrl) {
  const u = String(gitRepositoryUrl);
  const m = u.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!m) {
    throw new Error("discovery-payload: cannot parse owner/repo from gitRepositoryUrl");
  }
  const repo = m[2].replace(/\.git$/i, "");
  return { owner: m[1], repo };
}

/**
 * @param {string} s
 */
function utf8ByteLength(s) {
  return Buffer.byteLength(s, "utf8");
}

/**
 * @param {string} label
 * @param {string} s
 * @param {number} maxBytes
 */
function assertUtf8ByteLength(label, s, maxBytes) {
  const n = utf8ByteLength(s);
  if (n > maxBytes) {
    throw new Error(`${label}: UTF-8 length ${n} exceeds max ${maxBytes}`);
  }
}

/**
 * CRLF → LF, trim trailing whitespace/newlines, exactly one trailing LF.
 * @param {string} s
 */
function normalizeDiscoveryText(s) {
  let t = String(s).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.replace(/\s+$/, "");
  return `${t}\n`;
}

/**
 * @param {string} text
 * @param {number} n
 */
function tailLines(text, n) {
  const lines = normalizeDiscoveryText(text)
    .replace(/\n$/, "")
    .split("\n");
  if (lines.length === 1 && lines[0] === "") return [];
  const k = Math.max(0, Math.min(n, lines.length));
  return lines.slice(lines.length - k);
}

/**
 * @param {string} root
 */
function buildDiscoveryPayload(root) {
  const discoveryLib = require("./discovery-acquisition.lib.cjs");
  discoveryLib.validateDiscoveryAcquisition(root);
  const discovery = discoveryLib.loadDiscoveryAcquisition(root);
  const anchorsPath = join(root, "config", "public-product-anchors.json");
  const anchors = JSON.parse(readFileSync(anchorsPath, "utf8"));
  const canonicalOrigin = normalizeOrigin(anchors.productionCanonicalOrigin);
  const integrateUrl = `${canonicalOrigin}/integrate`;
  const openapiSelfCanonical = `${canonicalOrigin}/openapi-commercial-v1.yaml`;
  const { owner, repo } = parseGithubRepoFromUrl(anchors.gitRepositoryUrl);
  const llmsRaw = `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${DISCOVERY_LLM_BRANCH}/llms.txt`;
  const llmsBlob = `https://github.com/${owner}/${repo}/blob/${DISCOVERY_LLM_BRANCH}/llms.txt`;
  const openapiRaw = `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${DISCOVERY_LLM_BRANCH}/schemas/openapi-commercial-v1.yaml`;
  const llms = /** @type {{ intentPhrases: string[]; notFor: string[]; relatedQueries: string[] }} */ (
    discovery.llms
  );
  const demo = /** @type {{ title: string; transcript: string }} */ (discovery.shareableTerminalDemo);
  return {
    schemaVersion: 1,
    identityOneLiner: String(anchors.identityOneLiner),
    llmBranch: DISCOVERY_LLM_BRANCH,
    links: {
      site: `${canonicalOrigin}/`,
      integrate: integrateUrl,
      openapiCanonical: openapiSelfCanonical,
      openapiRaw,
      repo: String(anchors.gitRepositoryUrl),
      npm: String(anchors.npmPackageUrl),
      llmsRaw,
      llmsBlob,
    },
    appendix: {
      slug: String(discovery.slug),
      visitorProblemAnswer: String(discovery.visitorProblemAnswer),
      intentPhrases: llms.intentPhrases.map(String),
      notFor: llms.notFor.map(String),
      relatedQueries: llms.relatedQueries.map(String),
      demandMoments: /** @type {string[]} */ (discovery.demandMoments).map(String),
      indexableGuides: /** @type {unknown} */ (discovery.indexableGuides),
      indexableExamples: /** @type {unknown} */ (discovery.indexableExamples),
      shareableTerminalDemo: {
        title: String(demo.title),
        transcript: String(demo.transcript),
      },
    },
  };
}

/**
 * @param {Record<string, unknown>} payload
 */
function discoveryObjectFromAppendix(payload) {
  const ap = /** @type {{ slug: string; visitorProblemAnswer: string; intentPhrases: string[]; notFor: string[]; relatedQueries: string[]; demandMoments: string[]; indexableGuides?: { path: string; navLabel: string; problemAnchor: string }[]; indexableExamples?: { path: string; navLabel: string; problemAnchor: string; embedKey: string }[]; shareableTerminalDemo?: { title: string; transcript: string } }} */ (
    payload.appendix
  );
  const out = {
    slug: ap.slug,
    visitorProblemAnswer: ap.visitorProblemAnswer,
    demandMoments: ap.demandMoments,
    llms: {
      intentPhrases: ap.intentPhrases,
      notFor: ap.notFor,
      relatedQueries: ap.relatedQueries,
    },
  };
  if (ap.shareableTerminalDemo) {
    Object.assign(out, { shareableTerminalDemo: ap.shareableTerminalDemo });
  }
  if (Array.isArray(ap.indexableGuides)) {
    Object.assign(out, { indexableGuides: ap.indexableGuides });
  }
  if (Array.isArray(ap.indexableExamples)) {
    Object.assign(out, { indexableExamples: ap.indexableExamples });
  }
  return out;
}

/**
 * @param {Record<string, unknown>} payload
 */
function renderLlmsTextFromPayload(payload) {
  if (payload.schemaVersion !== 1) throw new Error("discovery-payload: unsupported schemaVersion");
  const links = /** @type {Record<string, string>} */ (payload.links);
  const anchorsLike = {
    identityOneLiner: payload.identityOneLiner,
    gitRepositoryUrl: links.repo,
    npmPackageUrl: links.npm,
  };
  const canonicalOrigin = links.site.replace(/\/$/, "");
  const integrateUrl = links.integrate;
  const openapiSelfCanonical = links.openapiCanonical;
  const lines = [
    "# AgentSkeptic",
    "",
    "## Summary",
    String(payload.identityOneLiner),
    "",
    "## Primary links",
    `- Canonical site: ${links.site}`,
    `- First-run integration: ${integrateUrl}`,
    `- OpenAPI (canonical): ${openapiSelfCanonical}`,
    `- OpenAPI (repo raw): ${links.openapiRaw}`,
    `- Source repository: ${links.repo}`,
    `- npm package: ${links.npm}`,
    `- llms.txt (repo raw): ${links.llmsRaw}`,
    "",
  ];
  const base = lines.join("\n");
  const { appendDiscoveryLlmsAppendix } = require("./discovery-acquisition.lib.cjs");
  const synthetic = discoveryObjectFromAppendix(payload);
  const raw = appendDiscoveryLlmsAppendix(base, synthetic, canonicalOrigin);
  return normalizeDiscoveryText(raw);
}

/**
 * @param {Record<string, unknown>} payload
 */
function renderCiSummaryMarkdownFromPayload(payload) {
  if (payload.schemaVersion !== 1) throw new Error("discovery-payload: unsupported schemaVersion");
  const L = /** @type {Record<string, string>} */ (payload.links);
  const lines = [
    "## AgentSkeptic",
    "",
    String(payload.identityOneLiner),
    "",
    "- Canonical site: " + L.site,
    "- Integrate: " + L.integrate,
    "- OpenAPI: " + L.openapiCanonical,
    "- OpenAPI (repo raw): " + L.openapiRaw,
    "- Repository: " + L.repo,
    "- npm: " + L.npm,
    "- llms.txt (raw): " + L.llmsRaw,
    "- llms.txt (blob): " + L.llmsBlob,
    "",
  ];
  const out = lines.join("\n");
  assertUtf8ByteLength("ci_summary_markdown", out, MAX_SUMMARY_UTF8_BYTES);
  return normalizeDiscoveryText(out);
}

/**
 * @param {string} stderrText
 */
function formatStderrBlock(stderrText) {
  const trimmed = String(stderrText).trim();
  if (!trimmed) {
    return "## CLI stderr (last 20 lines)\n\n_(no stderr)_\n";
  }
  const tail = tailLines(trimmed, STDERR_TAIL_LINES);
  const body = tail.join("\n");
  return `## CLI stderr (last ${STDERR_TAIL_LINES} lines)\n\n\`\`\`text\n${body}\n\`\`\`\n`;
}

/**
 * Assemble PR body: header → optional verdict → stderr → footer → marker.
 * Truncates stderr block from the start only until UTF-8 length ≤ max.
 *
 * @param {Record<string, unknown>} payload
 * @param {{ stderrText: string; workflowStdoutText: string }} capture
 */
function renderCiPrBodyFromPayload(payload, capture) {
  if (payload.schemaVersion !== 1) throw new Error("discovery-payload: unsupported schemaVersion");
  const L = /** @type {Record<string, string>} */ (payload.links);
  const stderrText = capture.stderrText ?? "";
  const workflowStdoutText = capture.workflowStdoutText ?? "";

  const header = `## AgentSkeptic — verification failed

${String(payload.identityOneLiner)}

`;

  const verdictTrim = String(workflowStdoutText).trim();
  const oneLine =
    verdictTrim.length > 0 ? verdictTrim.split("\n")[0].slice(0, 500) : "";
  const verdictSection = oneLine
    ? ["## Verification stdout (first line)", "", "```", oneLine, "```", ""].join("\n")
    : "";

  let stderrBlock = formatStderrBlock(stderrText);

  const footer = [
    "---",
    "",
    "- " + L.site,
    "- " + L.integrate,
    "- " + L.repo,
    "",
    PR_MARKER_LINE,
    "",
  ].join("\n");

  function assemble(verdict, sb) {
    const raw = header + verdict + sb + footer;
    return normalizeDiscoveryText(raw);
  }

  let body = assemble(verdictSection, stderrBlock);
  if (utf8ByteLength(body) <= MAX_PR_BODY_UTF8_BYTES) {
    return body;
  }

  const stderrLines = stderrText.trim() ? tailLines(stderrText, STDERR_TAIL_LINES) : [];
  for (let drop = 1; drop <= stderrLines.length; drop++) {
    const shortened = stderrLines.slice(drop);
    const inner = shortened.length ? shortened.join("\n") : "";
    stderrBlock = inner
      ? `## CLI stderr (last ${STDERR_TAIL_LINES} lines)\n\n\`\`\`text\n${inner}\n\`\`\`\n`
      : "## CLI stderr (last 20 lines)\n\n_(no stderr)_\n";
    body = assemble(verdictSection, stderrBlock);
    if (utf8ByteLength(body) <= MAX_PR_BODY_UTF8_BYTES) return body;
  }

  stderrBlock = "## CLI stderr (last 20 lines)\n\n_(no stderr)_\n";
  body = assemble(verdictSection, stderrBlock);
  if (utf8ByteLength(body) <= MAX_PR_BODY_UTF8_BYTES) return body;

  if (verdictSection) {
    body = assemble("", stderrBlock);
    if (utf8ByteLength(body) <= MAX_PR_BODY_UTF8_BYTES) return body;
  }

  throw new Error(
    `discovery-payload: PR body still exceeds ${MAX_PR_BODY_UTF8_BYTES} bytes after truncation`,
  );
}

/**
 * GitHub list issue comments returns ascending creation time.
 * Pick the newest comment whose body includes the marker.
 * @param {Array<{ id: number; body?: string | null }>} comments
 * @param {string} marker
 * @returns {{ action: 'create' } | { action: 'update'; id: number }}
 */
function selectPrCommentUpsert(comments, marker) {
  const withMarker = comments.filter((c) => {
    const b = String(c.body ?? "");
    return b.includes(marker) || b.includes(PR_MARKER_LINE_LEGACY);
  });
  if (withMarker.length === 0) return { action: "create" };
  const newest = withMarker[withMarker.length - 1];
  return { action: "update", id: newest.id };
}

module.exports = {
  DISCOVERY_LLM_BRANCH,
  PR_MARKER_LINE,
  PR_MARKER_LINE_LEGACY,
  MAX_SUMMARY_UTF8_BYTES,
  MAX_PR_BODY_UTF8_BYTES,
  STDERR_TAIL_LINES,
  buildDiscoveryPayload,
  normalizeDiscoveryText,
  utf8ByteLength,
  assertUtf8ByteLength,
  tailLines,
  renderLlmsTextFromPayload,
  renderCiSummaryMarkdownFromPayload,
  renderCiPrBodyFromPayload,
  parseGithubRepoFromUrl,
  selectPrCommentUpsert,
};
