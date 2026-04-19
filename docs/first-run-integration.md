# First-run integration (SSOT)

<!-- epistemic-contract:consumer:first-run-integration -->
**Epistemic framing (pointer only):** Normative epistemic definitions live only in [`epistemic-contract.md`](epistemic-contract.md). Operational four-way model, Decision-ready ProductionComplete, and commercial verdict semantics: [`adoption-epistemics-ssot.md`](adoption-epistemics-ssot.md).

**Throughput (operator, pointer only):** Metric SQL and ids: [`growth-metrics-ssot.md`](growth-metrics-ssot.md). Interpretation and proxies: [`epistemic-contract.md`](epistemic-contract.md). User outcome vs telemetry capture: [`funnel-observability-ssot.md`](funnel-observability-ssot.md). **Decision-ready ProductionComplete:** [`adoption-epistemics-ssot.md#decision-ready-productioncomplete-normative`](adoption-epistemics-ssot.md#decision-ready-productioncomplete-normative).
<!-- /epistemic-contract:consumer:first-run-integration -->

**Prerequisite:** Read [**Buy vs build: why not only SQL checks**](../README.md#buy-vs-build-why-not-only-sql-checks) in the root [**README.md**](../README.md) so the recurring failure mode, why ad-hoc SQL checks fail as a long-term substitute, and the **Quick → Contract** path are clear before you integrate.

This document is the **integrator SSOT**. **Grounded product output**—contract verification you can treat as evidence against **your** authoritative SQLite or Postgres—starts only when you run verification on **integrator-owned** events/registry (or bootstrap output from **your** `tool_calls`) and retain the Decision-ready artifact bar when a human decision depends on the run. Everything under [**Mechanical preflight**](#mechanical-preflight) below (demo, bundled quickstart, PatternComplete-shaped runs, **`/integrate`**) is **pedagogy and mechanics**: it proves the engine and wiring, **not** by itself ProductionComplete.

**Optional (not part of the primary path):** same-origin **registry draft** (model-assisted)—semantics, schema pins, and harness proof live in [registry-draft-ssot.md](registry-draft-ssot.md); it is **not** contract verification.

**Verification hypothesis (optional telemetry context):** when you set **`AGENTSKEPTIC_VERIFICATION_HYPOTHESIS`** in the shell (for example from the copy block on **`/integrate`**), the CLI may include it on **`POST /api/funnel/product-activation`** so operators can see what mismatch you intended to check. Allowed characters and length are defined **only** in [`src/telemetry/verificationHypothesisContract.ts`](../src/telemetry/verificationHypothesisContract.ts); wire and metadata semantics: [`funnel-observability-ssot.md`](funnel-observability-ssot.md).

**Why one doc:** One narrative reduces drift between the website, README, and ad-hoc integrator notes.

Copy-paste shell commands (Postgres, LangGraph, manual `node dist/cli.js …`) live only in **[partner-quickstart-commands.md](partner-quickstart-commands.md)** (generated; do not duplicate those blocks here).

## Grounded integrator-owned output (primary path)

### Integrator-owned CLI gate

After **`npm run build`**, prefer **`agentskeptic verify-integrator-owned`** (same flags as contract batch verify) so **shipped example fixture triples** are **rejected** with exit **2** and stderr markers **`INTEGRATOR_OWNED_GATE`** / **`bundled_examples`**. Full contract: [`docs/agentskeptic.md`](agentskeptic.md) — **Integrator-owned gate** (`verify-integrator-owned`). Standard **`agentskeptic --workflow-id …`** without the subcommand remains valid for **demos and CI** on bundled paths.

### Bootstrap and verify on your sources

If you already have **OpenAI-style `tool_calls`** JSON and a read-only **SQLite** or **Postgres** URL, you can generate **`events.ndjson`**, **`tools.json`**, **`quick-report.json`**, and **`README.bootstrap.md`** in one step—normative contract, flags, and trust rules are only in [`bootstrap-pack-normative.md`](bootstrap-pack-normative.md). Example:

```bash
agentskeptic bootstrap --input path/to/bootstrap-input.json --db path/to/your.db --out path/to/new-pack-dir
```

Use the generated artifacts as your starting contract for production NDJSON emission, or skip this entirely if you already emit NDJSON another way. Then run contract verification on **your** paths, for example:

```bash
agentskeptic verify-integrator-owned --workflow-id <id> --events path/to/events.ndjson --registry path/to/tools.json --db path/to/your.db
```

(**Postgres:** use **`--postgres-url`** instead of **`--db`**; exactly one.)

**ProductionComplete** means bootstrap and/or contract verify against **your** sources and **your** database—ongoing registry ownership. This repository **cannot** automate proof without your credentials and data. For human or compliance decisions, meet **Decision-ready ProductionComplete** (artifacts A1–A5) in [`adoption-epistemics-ssot.md#decision-ready-productioncomplete-normative`](adoption-epistemics-ssot.md#decision-ready-productioncomplete-normative).

### What success looks like (integrator-owned)

- **Exit code `0`**: stdout is one **WorkflowResult** JSON object with `"status":"complete"` and the step `"verified"`.
- **Stderr** (default) is the **human verification report** (trust line + per-step wording). Use **`--no-truth-report`** if you want stderr empty and JSON-only on stdout.

Example stdout (one JSON object; `schemaVersion` and nested fields evolve over releases):

```json
{
  "schemaVersion": 15,
  "workflowId": "wf_partner",
  "status": "complete",
  "steps": [
    {
      "seq": 0,
      "toolId": "crm.upsert_contact",
      "status": "verified"
    }
  ]
}
```

The human report on stderr will state that the workflow **matched the database** for that step.

## Mechanical preflight

Use this section to **believe the product** and to satisfy **CI-shaped** checks. It does **not** replace Step 4 on **your** inputs.

Send this bundle to someone who should **see green vs ROW_ABSENT in one sitting** before they touch production data. The **same** ordered shell commands as **`https://agentskeptic.com/integrate`** (clone, install, build, demo, PatternComplete-shaped verify, guard, then final bootstrap + verify on `AGENTSKEPTIC_VERIFY_DB`) live in [`scripts/templates/integrate-activation-shell.bash`](../scripts/templates/integrate-activation-shell.bash) (L0).

### What this does

- Takes an **append-only NDJSON log** of tool observations (what the agent claims it did).
- Uses a small **`tools.json` registry** to turn each call into **expected SQL row/field checks**.
- Runs **read-only `SELECT`s** against **SQLite or Postgres** and emits a **human report + machine JSON** (`complete` / `inconsistent` / `incomplete`).

### What you need

| Requirement | Notes |
|-------------|--------|
| **Node.js** | **≥ 22.13** (demo uses built-in `node:sqlite`). |
| **SQLite** *or* **Postgres** | One database the verifier can reach **read-only** for checks. |
| **Docker** | Optional—handy to spin up **Postgres** locally (`postgres:16` is enough). |
| **npm / CLI** | From this repo: **`npm install`** once, then **`npm run build`** so **`dist/`** exists. Published **npm** installs the **`agentskeptic`** binary—same CLI as **`node dist/cli.js`**. |

## Step 1: Run the demo

```bash
npm start
```

This builds, seeds **`examples/demo.db`**, runs two workflows from the bundled files, and prints reports plus JSON. You should see **`wf_complete`** end **`complete` / `verified`** and **`wf_missing`** end **`inconsistent` / `missing`** with **`ROW_ABSENT`**.

## Step 2: Run npm run first-run-verify (contract verify; same as /integrate)

From the **repository root**, run contract verification on the bundled quickstart workflow (read-only SQL, golden lock check):

```bash
npm run first-run-verify
```

*(For convenience: `npm run partner-quickstart` is the **same** npm script in this repository’s root `package.json`.)*

Canonical example files the script uses (do not duplicate their contents in this doc):

| File | Role |
|------|------|
| **`examples/partner-quickstart/partner.events.ndjson`** | One NDJSON line per observed tool call; **`workflowId`** is **`wf_partner`**. |
| **`examples/partner-quickstart/partner.tools.json`** | Registry for **`crm.upsert_contact`**. |
| **`examples/partner-quickstart/partner.seed.sql`** | `CREATE TABLE contacts` + row for **`partner_1`**. |
| **`examples/partner-quickstart/partner.ci-lock-v1.json`** | Golden **`ci-lock-v1`** for **`wf_partner`**; `npm run first-run-verify` writes a temp **`--output-lock`** file and **byte-compares** to this read-only fixture (see `scripts/partner-quickstart-verify.mjs`). |

To force a mismatch after a successful run, delete that row or change `name`/`status` in the DB and run verification again—you should get **`inconsistent`** with **`ROW_ABSENT`** or a field mismatch in the report.

## Step 3: Bootstrap contract gradient (same `demo.db`; pinned fixture)

This step is the **deterministic bridge** from the bundled quickstart to a **generated pack + contract `verify`** on the same **`examples/demo.db`** produced by **`npm start`**. It does **not** substitute for wiring your production agents—you still emit NDJSON and maintain a registry for real workflows—but it proves the bootstrap → verify path end-to-end without hand-authoring `tools.json`. Normative contract: [`bootstrap-pack-normative.md`](bootstrap-pack-normative.md).

From the **repository root** (after Steps 1–2), run:

```bash
OUT="$(mktemp -u "${TMPDIR:-/tmp}/agentskeptic-integrate-mid-XXXXXXXX")"
ADOPT_DB="$(mktemp)"
trap 'rm -rf "$OUT" "$ADOPT_DB"' EXIT
node dist/cli.js bootstrap --input test/fixtures/bootstrap-pack/input.json --db examples/demo.db --out "$OUT"
cp examples/demo.db "$ADOPT_DB"
node dist/cli.js --workflow-id wf_bootstrap_fixture --events "$OUT/events.ndjson" --registry "$OUT/tools.json" --db "$ADOPT_DB"
```

You should see **`wf_bootstrap_fixture`** end **`complete`** / **`verified`** with machine JSON on stdout and the human report on stderr. The **`cp`** line makes the final verify use a **DB path under temp** (PatternComplete per [AdoptionComplete_PatternComplete](#adoptioncomplete_patterncomplete-normative)), not only bundled example paths. **After this succeeds**, continue to [Step 4](#step-4-bootstrap-when-you-have-your-own-tool_calls-and-a-db-url) for ProductionComplete on **your** database and `tool_calls`.

## Step 4: Bootstrap when you have your own tool_calls and a DB URL

Complete ProductionComplete-shaped work on **your** `tool_calls`, database, and registry—the integrator-owned CLI gate, bootstrap flags, example **`verify-integrator-owned`** commands, stdout/stderr success criteria, and **Decision-ready ProductionComplete**—under **[Bootstrap and verify on your sources](#bootstrap-and-verify-on-your-sources)** in [Grounded integrator-owned output](#grounded-integrator-owned-output-primary-path) above.

## Integrate spine (normative)

**Authority stack**

- **L0** — Exact shell bytes only: [`scripts/templates/integrate-activation-shell.bash`](../scripts/templates/integrate-activation-shell.bash) (mirrored into the site as `INTEGRATE_ACTIVATION_SHELL_BODY` after `npm run sync:public-product-anchors` / website prebuild).
- **L0.5** — Fixed **BootstrapPackInput** plus required SQLite state: [`examples/integrate-your-db/bootstrap-input.json`](../examples/integrate-your-db/bootstrap-input.json) and [`examples/integrate-your-db/required-sqlite-state.sql`](../examples/integrate-your-db/required-sqlite-state.sql). The SQL file is the **machine contract** for tables and rows the final bootstrap must observe. For **`wf_integrate_spine`**, today’s quick-inferred export is **PK-identity only** (`id` = `c_integrate_spine`); a **missing** row fails `bootstrap`; keep the full L0.5 row (including `Alice` / `active`) as the normative integrator target even if field-only drift is not always rejected by quick.

**IntegrateSpineComplete**

- The full L0 script **exit code is 0** iff every step completes, including the **final** `node dist/cli.js bootstrap … --input examples/integrate-your-db/bootstrap-input.json` and the following **`verify`** on `"$AGENTSKEPTIC_VERIFY_DB"`.
- If `AGENTSKEPTIC_VERIFY_DB` is unset, empty, not a file, or not readable, the script **exits non-zero immediately before that final bootstrap** (after the demo / PatternComplete-shaped segment). That is **not** IntegrateSpineComplete; it is a deliberate **non-terminal-success** outcome so demo-only runs never report success for the whole spine.

**PatternComplete vs IntegrateSpineComplete**

- Mid-script, L0 still runs the **PatternComplete-shaped** segment (temp pack paths and temp DB copy per [AdoptionComplete_PatternComplete](#adoptioncomplete_patterncomplete-normative)).
- The **final** verify uses the integrator-supplied SQLite path and may **not** satisfy checklist **AC-OPS-03** (DB path under OS temp only). That is **by design** for this spine. [`scripts/validate-adoption-complete.mjs`](../scripts/validate-adoption-complete.mjs) remains the CI proof for **PatternComplete** alone.

**Prepare `AGENTSKEPTIC_VERIFY_DB`**

- Use an absolute or relative path to a disposable SQLite file. From the **cloned** repository root, apply L0.5 SQL, for example:  
  `sqlite3 "$AGENTSKEPTIC_VERIFY_DB" < examples/integrate-your-db/required-sqlite-state.sql`  
  (Any tool that executes the same statements is acceptable if you do not have the `sqlite3` CLI.)

**`INTEGRATE_SPINE_GIT_URL`**

- Optional. Defaults to the public GitHub clone URL in L0. CI may set `file://…/.git` for hermetic end-to-end proof; integrators normally omit it.

## AdoptionComplete_PatternComplete (normative)

This section is the **single canonical definition** of **PatternComplete** (what this repository can prove in CI) versus **ProductionComplete** (what only you can prove on your systems). Every other surface (`/integrate`, README discovery strings, `golden-path.md`) is a **pointer-only** summary; do not duplicate normative doctrine outside the linked headings.

### Scopes

- **PatternComplete:** You ran **bootstrap** (pinned fixture) and **contract `verify`** with **artifact paths under a temp directory** and a **SQLite DB file copy under your OS temp directory** (not the literal `examples/demo.db` path on the verify invocation). That proves the **mechanical** contract path and **path-separated** workload classification (`non_bundled` per [funnel-observability-ssot.md](funnel-observability-ssot.md#qualification-proxy-operator)) without claiming access to your production secrets.
- **ProductionComplete:** You run bootstrap and/or contract verify against **your** OpenAI-style `tool_calls` / NDJSON sources and **your** authoritative SQLite or Postgres—[Step 4](#step-4-bootstrap-when-you-have-your-own-tool_calls-and-a-db-url) and ongoing registry ownership. This repository **cannot** automate proof of ProductionComplete without your credentials and data; it is **your** CI or manual evidence.

### Trusted interpretation (checklist IDs)

Each ID is satisfied for PatternComplete when you have **read** the linked normative prose and the successful PatternComplete run has exercised **contract** batch verification (human report on stderr, one `WorkflowResult` JSON object on stdout per [verification-operational-notes.md](verification-operational-notes.md)).

| ID | One-line meaning | Authoritative pointer |
|----|------------------|------------------------|
| **AC-TRUST-01** | Pass/fail is **state vs expectation**, not proof a tool executed. | [verification-product-ssot.md — What this does not prove](verification-product-ssot.md#what-this-does-not-prove-trust-boundary) |
| **AC-TRUST-02** | **Contract** replay is registry-backed; **Quick** is provisional—not audit-final interchangeably. | [verification-product-ssot.md — Quick Verify positioning](verification-product-ssot.md#quick-verify-positioning) and [quick-verify-normative.md](quick-verify-normative.md) (ingest ladder—link only; do not copy thresholds here) |
| **AC-TRUST-03** | **Export → replay** is **partial coverage**; do not treat it as blanket parity with everything Quick inferred. | [verification-product-ssot.md — Contract replay is partial coverage](verification-product-ssot.md#contract-replay-is-partial-coverage) and [verification-operational-notes.md — Quick export vs contract replay coverage](verification-operational-notes.md#quick-export-vs-contract-replay-coverage) |
| **AC-TRUST-04** | Automation consumes **stdout** machine JSON; human report on **stderr**—do not parse stderr anchors for automation. | [verification-operational-notes.md — For integrators](verification-operational-notes.md#for-integrators) |

### Operationalizable path (checklist IDs)

Each ID must be **true** for a run to count as PatternComplete in [`artifacts/adoption-complete-validation-verdict.json`](../artifacts/adoption-complete-validation-verdict.json) (written by `scripts/validate-adoption-complete.mjs`).

| ID | Criterion |
|----|-----------|
| **AC-OPS-01** | Final contract verify **`--events`** path is **not** one of the bundled example NDJSON suffixes in [`src/commercial/verifyWorkloadClassify.ts`](../src/commercial/verifyWorkloadClassify.ts) (`BUNDLED_PATH_SUFFIXES` for events). |
| **AC-OPS-02** | Final verify **`--registry`** path is **not** a bundled example registry suffix on that allowlist. |
| **AC-OPS-03** | Final verify **`--db`** SQLite path is under the OS temp directory and is **not** the repository’s literal `examples/demo.db` path. |

### Completion

**PatternComplete** iff `node scripts/validate-adoption-complete.mjs` exits **0** and the verdict file lists all checklist keys **true**. **ProductionComplete** is satisfied only when you complete [Step 4](#step-4-bootstrap-when-you-have-your-own-tool_calls-and-a-db-url) (or equivalent) on **your** inputs; that is **not** asserted by this repo’s default `npm test` chain.

## Common mistakes

- **Node too old** — need **22.13+**; upgrade before `npm start`.
- **No build** — run **`npm run build`** (or **`npm start`** once) so **`dist/`** exists before calling **`node dist/cli.js`**.
- **Both or neither DB flags** — pass **exactly one** of **`--db`** or **`--postgres-url`**.
- **`--workflow-id` mismatch** — must match `workflowId` in the NDJSON lines you want verified.
- **Missing registry entry** — every `toolId` in the log needs a matching object in **`tools.json`**.
- **Params vs registry** — JSON pointers like **`/recordId`** and **`/fields`** must exist on `params` for that tool line.
- **Commands out of date** — regenerate `docs/partner-quickstart-commands.md` with **`node scripts/generate-partner-quickstart-commands.mjs`** after changing quickstart wiring (CI checks this).
- **Node SQLite warning** — `ExperimentalWarning: SQLite is...` on stderr is from Node; it does not mean verification failed.

## Optional (after the main path)

These are **not** part of the numbered mechanical steps above—only reach for them after **Step 3** (or **Step 4** when you need LangGraph-shaped samples).

**LangGraph-shaped sample** — Minimal graph run + verify: [`examples/langgraph-reference/README.md`](../examples/langgraph-reference/README.md). What that README may claim vs SSOT is fixed in [`langgraph-reference-boundaries-ssot.md`](langgraph-reference-boundaries-ssot.md#langgraph-reference-documentation-boundaries).

---

## Production npm, billing, telemetry, and operator metrics

Shipping the **published npm** package, **Stripe** checkout, **`AGENTSKEPTIC_API_KEY`** (or legacy **`WORKFLOW_VERIFIER_API_KEY`**), **`POST /api/v1/usage/reserve`**, CI **`enforce`**, split deployments, **`AGENTSKEPTIC_TELEMETRY=0`**, **`install_id`**, and operator funnel metrics are **not** first-run steps—read **[`commercial-ssot.md`](commercial-ssot.md)** end-to-end, then **[`commercial-entitlement-policy.md`](commercial-entitlement-policy.md)** and **[`commercial-enforce-gate-normative.md`](commercial-enforce-gate-normative.md)** for build gates. Beacon semantics, HTTP contracts, and growth SQL live in **[`funnel-observability-ssot.md`](funnel-observability-ssot.md)** and **[`growth-metrics-ssot.md`](growth-metrics-ssot.md)**. The root **[README.md](../README.md)** summarizes OSS vs commercial builds.
