/* global fetch, URLSearchParams, document, window */

const state = {
  nextCursor: null,
  filterParams: new URLSearchParams(),
  selected: new Set(),
};

function api(path, opts) {
  return fetch(path, opts).then(async (r) => {
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { _raw: text };
    }
    if (!r.ok) {
      const err = new Error(data?.message || r.statusText);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  });
}

function buildFilterParamsFromForm() {
  const form = document.getElementById("filters");
  const fd = new FormData(form);
  const p = new URLSearchParams();
  for (const [k, v] of fd.entries()) {
    if (k === "includeLoadErrors" || k === "hasPathFindings") continue;
    if (v !== "" && v != null) {
      p.set(k, String(v));
    }
  }
  // Unchecked checkboxes are omitted from FormData.
  const includeLoadErrorsEl = form.querySelector('[name="includeLoadErrors"]');
  if (includeLoadErrorsEl && !includeLoadErrorsEl.checked) {
    p.set("includeLoadErrors", "false");
  }
  const hasPathFindingsEl = form.querySelector('[name="hasPathFindings"]');
  if (hasPathFindingsEl && hasPathFindingsEl.checked) {
    p.set("hasPathFindings", "true");
  }
  return p;
}

async function loadRuns(append) {
  const p = new URLSearchParams(state.filterParams);
  p.set("limit", "100");
  if (append && state.nextCursor) p.set("cursor", state.nextCursor);
  else state.nextCursor = null;

  const data = await api(`/api/runs?${p.toString()}`);
  const tbody = document.getElementById("runs-body");
  if (!append) {
    tbody.innerHTML = "";
    state.selected.clear();
  }
  document.getElementById("runs-meta").textContent = `totalMatched=${data.totalMatched} showing ${tbody.children.length + data.items.length} (paged)`;
  for (const row of data.items) {
    const tr = document.createElement("tr");
    tr.className = row.loadStatus === "error" ? "load-error" : "load-ok";
    tr.dataset.runId = row.runId;
    const codes = (row.primaryReasonCodes || []).slice(0, 6).join(", ");
    const pathCodes = (row.pathFindingCodes || []).slice(0, 4).join(", ");
    tr.innerHTML = `
      <td><input type="checkbox" class="pick" aria-label="select ${row.runId}" /></td>
      <td><button type="button" class="open-run">${escapeHtml(row.runId)}</button></td>
      <td>${escapeHtml(row.loadStatus)}</td>
      <td>${escapeHtml(row.workflowId || "—")}</td>
      <td>${escapeHtml(row.status || "—")}</td>
      <td>${escapeHtml(row.actionableCategory || "—")}</td>
      <td>${escapeHtml(row.customerId || "—")}</td>
      <td>${escapeHtml(pathCodes || "—")}</td>
      <td>${escapeHtml(codes)}</td>
    `;
    tr.querySelector(".open-run").addEventListener("click", () => openDetail(row.runId));
    tr.querySelector(".pick").addEventListener("change", (ev) => {
      if (ev.target.checked) {
        state.selected.add(row.runId);
        tr.classList.add("selected");
      } else {
        state.selected.delete(row.runId);
        tr.classList.remove("selected");
      }
      document.getElementById("run-compare").disabled = state.selected.size < 2;
    });
    tbody.appendChild(tr);
  }
  state.nextCursor = data.nextCursor;
  document.getElementById("load-more").hidden = !data.nextCursor;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatVerdictSurface(vs) {
  if (!vs || typeof vs !== "object") return "";
  const counts = vs.stepStatusCounts || {};
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}: ${n}`);
  const countsLine = parts.length ? parts.join(" · ") : "(no steps)";
  return `
      <div class="verdict-panel" role="region" aria-label="Workflow verdict">
        <div class="verdict-status">Workflow status: <code>${escapeHtml(vs.status)}</code></div>
        <div class="verdict-trust">${escapeHtml(vs.trustSummary || "")}</div>
        <div class="verdict-counts">Step outcomes: ${escapeHtml(countsLine)}</div>
      </div>`;
}

async function openDetail(runId) {
  const drawer = document.getElementById("detail-drawer");
  const body = document.getElementById("detail-body");
  const title = document.getElementById("detail-title");
  drawer.classList.remove("hidden");
  title.textContent = `Run: ${runId}`;
  body.innerHTML = "<p>Loading…</p>";
  try {
    const data = await api(`/api/runs/${encodeURIComponent(runId)}`);
    if (data.loadStatus === "error") {
      body.innerHTML = `
        <p class="focus-panel"><strong>Load error</strong> <code>${escapeHtml(data.error.code)}</code></p>
        <pre class="json-out">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
      `;
      return;
    }
    let focusHtml = "";
    const focusSet = new Set();
    try {
      const focus = await api(`/api/runs/${encodeURIComponent(runId)}/focus`);
      focusHtml = `<div class="focus-panel"><strong>Focus targets (from API)</strong><pre>${escapeHtml(JSON.stringify(focus.targets, null, 2))}</pre></div>`;
      for (const t of focus.targets) {
        if (t.kind === "seq") focusSet.add(`seq:${t.value}`);
        if (t.kind === "ingestIndex") focusSet.add(`ingest:${t.value}`);
        if (t.kind === "runEventId") focusSet.add(`runEventId:${t.value}`);
      }
    } catch (e) {
      focusHtml = `<p class="meta">Focus: ${escapeHtml(e.message)}</p>`;
    }
    const verdictHtml = formatVerdictSurface(data.workflowVerdictSurface);
    const steps = (data.executionTrace?.nodes || []).map((n, i) => {
      const seq = n.toolSeq ?? n.verificationLink?.seq;
      const seqKey = seq != null ? `seq:${seq}` : "";
      const ingestKey = `ingest:${n.ingestIndex}`;
      const runEvKey = n.runEventId ? `runEventId:${n.runEventId}` : "";
      const hit =
        (seqKey && focusSet.has(seqKey)) ||
        focusSet.has(ingestKey) ||
        (runEvKey && focusSet.has(runEvKey));
      return `<div class="trace-step ${hit ? "focus-hit" : ""}" data-idx="${i}">${escapeHtml(JSON.stringify(n))}</div>`;
    });
    const trustHtml =
      typeof data.runTrustPanelHtml === "string"
        ? `<div class="run-trust-panel">${data.runTrustPanelHtml}</div>`
        : "";
    body.innerHTML = `
      ${trustHtml}
      ${verdictHtml}
      ${focusHtml}
      <h3>Trace nodes</h3>
      ${steps.join("") || "<p>(no trace nodes)</p>"}
      <h3>WorkflowResult</h3>
      <pre class="json-out">${escapeHtml(JSON.stringify(data.workflowResult, null, 2))}</pre>
    `;
  } catch (e) {
    body.innerHTML = `<p class="focus-panel">Error: ${escapeHtml(e.message)}</p>`;
  }
}

document.getElementById("filters").addEventListener("submit", (ev) => {
  ev.preventDefault();
  state.filterParams = buildFilterParamsFromForm();
  loadRuns(false).catch((e) => alert(e.message));
});

document.getElementById("clear-filters").addEventListener("click", () => {
  document.getElementById("filters").reset();
  document.querySelector('[name="includeLoadErrors"]').checked = true;
  state.filterParams = buildFilterParamsFromForm();
  loadRuns(false).catch((e) => alert(e.message));
});

document.getElementById("load-more").addEventListener("click", () => {
  loadRuns(true).catch((e) => alert(e.message));
});

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
  });
});

document.getElementById("refresh-patterns").addEventListener("click", async () => {
  const out = document.getElementById("patterns-out");
  out.textContent = "Loading…";
  const p = new URLSearchParams(state.filterParams);
  try {
    const data = await api(`/api/corpus-patterns?${p.toString()}`);
    out.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    out.textContent = JSON.stringify(e.data || { message: e.message }, null, 2);
  }
});

document.getElementById("run-compare").addEventListener("click", async () => {
  const ids = [...state.selected];
  const out = document.getElementById("compare-out");
  out.textContent = "Loading…";
  try {
    const data = await api("/api/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runIds: ids }),
    });
    if (typeof data.comparePanelHtml === "string") {
      out.innerHTML = data.comparePanelHtml;
    } else {
      out.textContent = "comparePanelHtml missing in response.";
    }
  } catch (e) {
    out.textContent = "";
    out.appendChild(document.createTextNode(JSON.stringify(e.data || { message: e.message }, null, 2)));
  }
});

document.getElementById("close-detail").addEventListener("click", () => {
  document.getElementById("detail-drawer").classList.add("hidden");
});

state.filterParams = buildFilterParamsFromForm();
loadRuns(false).catch((e) => {
  document.getElementById("runs-meta").textContent = `Failed to load: ${e.message}`;
});
