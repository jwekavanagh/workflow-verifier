<!-- discovery-readme-title:start -->
# AgentSkeptic — when traces say success but your database does not match
<!-- discovery-readme-title:end -->

<!-- discovery-acquisition-fold:start -->
## Your traces say "success." Your database disagrees.

Verify your database state with read-only SQL before you ship, bill, or close. Not traces. Not logs. The actual database.

Teams ship agent and automation workflows where traces, tool responses, and success flags look green while the database row is missing, stale, or wrong. AgentSkeptic compares structured tool activity to read-only SQL against your SQLite or Postgres at verification time and reports whether observed state matched expectations derived from what the workflow claimed—not whether the step narrative read as successful.

Use it when you need persisted rows checked against declared tool parameters at verification time before customer-facing actions, compliance evidence, or CI gates.

### Pasteable terminal proof (bundled demo)

```text
### Success (`wf_complete`)

workflow_id: wf_complete
workflow_status: complete
trust: TRUSTED: Every step matched the database under the configured verification rules.
steps:
  - seq=0 tool=crm.upsert_contact result=Matched the database.

{
  "schemaVersion": 15,
  "workflowId": "wf_complete",
  "status": "complete",
  "steps": [{ "seq": 0, "toolId": "crm.upsert_contact", "status": "verified" }]
}

### Failure (`wf_missing`)

workflow_id: wf_missing
workflow_status: inconsistent
steps:
  - seq=0 tool=crm.upsert_contact result=Expected row is missing from the database (the log implies a write that is not present).
    reference_code: ROW_ABSENT

{
  "schemaVersion": 15,
  "workflowId": "wf_missing",
  "status": "inconsistent",
  "steps": [
    {
      "seq": 0,
      "toolId": "crm.upsert_contact",
      "status": "missing",
      "reasons": [{ "code": "ROW_ABSENT" }]
    }
  ]
}
```

[Read the product brief](https://agentskeptic.com/database-truth-vs-traces)
<!-- discovery-acquisition-fold:end -->

## Buy vs build: why not only SQL checks

**The scar (one pattern, over and over):** the trace says the tool succeeded—here **`crm.upsert_contact`** / **`contacts`**—but the row is missing or wrong. The repo demo names it **`wf_missing`** / **`ROW_ABSENT`**; **the same failure shape** applies whenever your registry maps tool activity to SQL state (ledgers, orders, tickets—not only CRM). That is not a logging problem—it is a **money and risk** problem the moment you ship, bill, close, or treat the run as audit evidence.

**Why “we’ll just write SQL checks” stops working**

- **Drift:** Scripts rot when schemas and workflows change; nobody keeps them current.
- **No ownership:** The author leaves; the checks become folklore.
- **Not an org contract:** Expectations live in heads and one-off files—not in a shared **`tools.json`** + **NDJSON** contract everyone replays.
- **CI and audit:** Ad-hoc checks are skipped locally and rarely ship as **repeatable artifacts**; when the issue is cross-team or compliance, scripts do not hold. Use **CI lock** / enforcement when you need pins ([`docs/ci-enforcement.md`](docs/ci-enforcement.md)).

**What you standardize on instead:** when the row backs revenue or customer promises, **you stop betting the business on whoever wrote the last script.** AgentSkeptic is how the org **owns** the check: one verifier, one replayable contract, **Quick → Contract** when stakes go up—explore with **Quick Verify** ([`docs/quick-verify-normative.md`](docs/quick-verify-normative.md)), lock with **contract** mode and a **`tools.json`** registry when “we ran a query” is not evidence ([`docs/agentskeptic.md`](docs/agentskeptic.md)). **That is the responsible default** once the failure mode hurts.

**Core mechanism:** Read-only SQL checks that your database **at verification time** matches **expectations derived from structured tool activity**—not whether a trace step “succeeded.”

<!-- public-product-anchors:start -->
State verification engine: read-only SQL checks that database state matches expectations from structured tool activity (not arbitrary logs)—not proof of execution

- **Repository:** https://github.com/jwekavanagh/agentskeptic
- **npm package:** https://www.npmjs.com/package/agentskeptic
- **Canonical site:** https://agentskeptic.com
- **Integrate:** https://agentskeptic.com/integrate
- **OpenAPI (canonical):** https://agentskeptic.com/openapi-commercial-v1.yaml
- **llms.txt (agents, site):** https://agentskeptic.com/llms.txt
- **llms.txt (repo, raw):** https://raw.githubusercontent.com/jwekavanagh/agentskeptic/refs/heads/main/llms.txt
- **llms.txt (repo, blob):** https://github.com/jwekavanagh/agentskeptic/blob/main/llms.txt

<!-- public-product-anchors:end -->

## Try it (about one minute)

This is the fastest way to see **`ROW_ABSENT`** versus **verified** on the same screen—the concrete failure mode the section above is about (bundled CRM-style demo, not your production incident yet).

**Prerequisite:** **Node.js ≥ 22.13** (built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html)), or use [Docker](#docker-quickstart-optional) below.

**Fast first run on your own DB (bundled quickstart example):** after `npm install` and `npm run build`, run **`npm run partner-quickstart`** from the repo root (SQLite temp DB). Commands reference: **[`docs/partner-quickstart-commands.md`](docs/partner-quickstart-commands.md)**; narrative: **[`docs/first-run-integration.md`](docs/first-run-integration.md)** and **`/integrate`** on the site.

```bash
npm install
npm start
```

**What you should see:** `npm start` builds, seeds **`examples/demo.db`**, and runs two workflows from **`examples/events.ndjson`** with **`examples/tools.json`**. The first case ends **`complete` / `verified`**; the second **`inconsistent` / `missing`** with reason **`ROW_ABSENT`**. That contrast is the product on one screen.

`npm install` does not compile TypeScript. To run the CLI without `npm start`, run **`npm run build`** first so **`dist/`** exists.

### Docker quickstart (optional)

Use this when you want the bundled demo without Node **22.13+** on the host. The repo is bind-mounted so **`examples/demo.db`** stays on your machine.

**Bash / macOS / Linux** (repo root):

```bash
docker run --rm -it -v "$PWD:/work" -w /work node:22-bookworm bash -lc "npm install && npm start"
```

**PowerShell** (repo root):

```powershell
docker run --rm -it -v "${PWD}:/work" -w /work node:22-bookworm bash -lc "npm install && npm start"
```

## Minimal model (event → registry → result)

**One structured observation** (NDJSON line; full schema in [Event line schema](docs/agentskeptic.md#event-line-schema)):

```json
{"schemaVersion":1,"workflowId":"wf_complete","seq":0,"type":"tool_observed","toolId":"crm.upsert_contact","params":{"recordId":"c_ok","fields":{"name":"Alice","status":"active"}}}
```

**Registry entry** (excerpt; full file is **`examples/tools.json`**) telling the engine how that `toolId` maps to a row check:

```json
{
  "toolId": "crm.upsert_contact",
  "verification": {
    "kind": "sql_row",
    "table": { "const": "contacts" },
    "identityEq": [{ "column": { "const": "id" }, "value": { "pointer": "/recordId" } }],
    "requiredFields": { "pointer": "/fields" }
  }
}
```

**When the row matches:** workflow result (excerpt; demo prints full JSON to stdout):

```json
{
  "workflowId": "wf_complete",
  "status": "complete",
  "steps": [{ "seq": 0, "toolId": "crm.upsert_contact", "status": "verified" }]
}
```

When the row is missing or fields disagree, you get **`inconsistent`** / **`missing`** and reason codes such as **`ROW_ABSENT`**.

## What this is (and is not)

Retries, partial failures, and race conditions mean a success flag in a trace is not proof the intended row exists with the right values. The engine derives **expected** state from your registry and events and compares it to **observed** state with read-only `SELECT`s.

| This **is** | This is **not** |
|-------------|-----------------|
| A **SQL ground-truth state check** against expectations from structured tool activity | Generic observability, log search, or arbitrary unstructured logs |
| A verifier for **persisted state** after agent or automation workflows | A test runner for application code |
| Proof that **observed DB state matched expectations** at verification time | Proof that a tool **executed**, **wrote**, or **caused** that state |

**This is for you if** you need persisted-row SQL truth after agent or automation runs when the trace looks fine but the DB might not.

**This is not for you if** you need proof a tool executed, log search as verification, or a model where read-only SQL against your app DB is not the right check. Homepage “for you / not for you” copy lives in **`website/src/content/productCopy.ts`** (single source with the site).

**Trust boundary (once):** a green trace does **not** prove the row exists with the right values—only whether **read-only `SELECT`s** matched **expected** rows under your rules, not deep causality.

**Declared → expected → observed** (how reports reason about runs):

1. **Declared** — what the captured tool activity encodes (`toolId`, parameters).
2. **Expected** — what should hold in SQL under the rules (in **Quick Verify**, inferred; in **contract mode**, registry-driven from events).
3. **Observed** — what read-only SQL returned at verification time.

## Contract path (registry + events)

**CLI:** after **`npm install`** and **`npm run build`**, use **`agentskeptic`** (or **`npx agentskeptic`**, or **`node dist/cli.js`**). Postgres: **`--postgres-url`** instead of **`--db`** (exactly one).

Typical integration:

1. Emit **one NDJSON line per tool observation** (see [Event line schema](docs/agentskeptic.md#event-line-schema)).
2. Add a **registry** entry per `toolId` (start from **`examples/templates/`**).
3. Run verification:

```bash
npm run build
agentskeptic --workflow-id <id> --events <path> --registry <path> --db <sqlitePath>
```

Replay the bundled files: **`wf_complete`** / **`examples/events.ndjson`** / **`examples/tools.json`** / **`examples/demo.db`** (same flags as above).

**From source without `agentskeptic` on PATH:** `node dist/cli.js` with the same flags.

**Why SQLite in the demo:** file-backed ground truth with no extra services. The demo (re)creates **`examples/demo.db`**; verification still uses read-only SQL.

## Quick Verify and assurance (optional)

**Quick Verify** (`agentskeptic quick`): inferred checks, **no registry file**; **provisional**, not audit-final—graduate to **contract mode** for explicit per-tool expectations. Full contract: **[`docs/quick-verify-normative.md`](docs/quick-verify-normative.md)**.

**Input contract:** We only accept **structured tool activity**—JSON or NDJSON that describes tool calls and parameters our ingest model can extract—not arbitrary logs, traces, or unstructured observability text.
Verification uses read-only SQL against your database; API-only or non-SQL systems are out of scope for this tool.

```bash
npm run build
agentskeptic quick --input test/fixtures/quick-verify/pass-line.ndjson --db examples/demo.db --export-registry ./quick-export.json
```

Use **`--postgres-url`** instead of **`--db`**; **`-`** as **`--input`** reads stdin.

**Assurance** (`assurance run` / `assurance stale`): multi-scenario sweeps and staleness over saved reports—**[Assurance subsystem](docs/agentskeptic.md#assurance-subsystem-normative)**, **[`examples/assurance/manifest.json`](examples/assurance/manifest.json)**.

## Sample output (contract demo)

The **`npm start`** driver prints human report + workflow JSON to **stdout** (one stream for the demo). Normal CLI: machine JSON on **stdout**, human report on **stderr**—[Human truth report](docs/agentskeptic.md#human-truth-report). **Full success/failure transcripts** (same strings as below) are in the [acquisition fold](#your-traces-say-success-your-database-disagrees) at the top of this README.

### Success (`wf_complete`)

*Interpretation:* Under the configured rules, **expected** state matched **observed SQL** for this step—**state alignment**, not proof of execution.

### Failure (`wf_missing`)

*Interpretation:* **Expected** state from the tool activity implied a row **observed SQL** did not find—**inconsistent**—a gap traces alone often miss. Still not proof a write was attempted or rolled back.

## How this differs from logs, tests, and observability

| Approach | What it tells you |
|----------|-------------------|
| **Logs / traces** | A step ran, duration, errors—not “row X has columns Y.” |
| **Unit / integration tests** | Code paths in your repo—not production agent runs against live DB state. |
| **Metrics / APM** | Health and latency—not semantic equality of persisted records. |
| **Ad-hoc SQL checks / one-off scripts** | Same failure mode as [**Buy vs build**](#buy-vs-build-why-not-only-sql-checks)—drift, weak ownership, not a durable contract. |
| **agentskeptic** | Whether **observed SQL** matches **expectations from declared tool parameters** (contract mode), via read-only SQL—not proof the tool executed. |

## When to run it

Run **after** a workflow (or CI replay of its log), **before** you treat the outcome as safe for customer-facing or regulated actions.

**Inputs:** NDJSON observations, registry JSON, read-only **SQLite** or **Postgres**. Semantics: [`docs/relational-verification.md`](docs/relational-verification.md).

**Typical uses:** block a release, trigger human review, open an incident, or attach a verification artifact to an audit trail.

**CI with pinned outcomes:** **`agentskeptic enforce`** and committed **`ci-lock-v1`** fixtures—[`docs/ci-enforcement.md`](docs/ci-enforcement.md).

## Further capabilities (reference)

Everything beyond core contract verification lives in **[`docs/agentskeptic.md`](docs/agentskeptic.md)**—subcommands, hooks, bundles, debug, plan transition, human report layout, exit codes.

## Documentation map

| Doc | Purpose |
|-----|---------|
| [README — Buy vs build](#buy-vs-build-why-not-only-sql-checks) | Canonical **buy vs build** narrative (failure mode, scripts limits, Quick → Contract) |
| [`docs/agentskeptic.md`](docs/agentskeptic.md) | Authoritative CLI and behavior reference (SSOT) |
| [`docs/quick-verify-normative.md`](docs/quick-verify-normative.md) | Quick Verify normative contract |
| [`docs/verification-product-ssot.md`](docs/verification-product-ssot.md) | Product intent, trust boundary, authority matrix |
| [`docs/reconciliation-vocabulary-ssot.md`](docs/reconciliation-vocabulary-ssot.md) | Reconciliation dimension IDs and UI mapping |
| [`docs/verification-operational-notes.md`](docs/verification-operational-notes.md) | First-run runbooks, TTFV, export vs replay coverage |
| [`docs/langgraph-reference-boundaries-ssot.md`](docs/langgraph-reference-boundaries-ssot.md) | LangGraph reference path: emitter/CLI boundaries and test chain |
| [`docs/relational-verification.md`](docs/relational-verification.md) | Relational verification semantics |
| [`docs/ci-enforcement.md`](docs/ci-enforcement.md) | CI enforcement and lock fixtures |
| [`docs/correctness-definition-normative.md`](docs/correctness-definition-normative.md) | Correctness and limits (normative) |

## Development and testing

**Why SQLite:** same note as under [Contract path](#contract-path-registry--events) (file-backed demo DB; read-only verification SQL).

Runs build, Vitest, SQLite Node tests, first-run demo, `assurance run`, the commercial enforce test harness (minimal CI enforcement + enforce integration tests), and TTFV validation. No Postgres required.

**Full CI parity** (Postgres + Debug Console UI tests): set **`POSTGRES_ADMIN_URL`** and **`POSTGRES_VERIFICATION_URL`**, then **`npm run test:ci`**—see [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Example Postgres: `docker run -d --name etl-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`.

## Commercial CLI (npm) vs OSS (this repo)

Canonical write-up: **[`docs/commercial-ssot.md`](docs/commercial-ssot.md)** (npm package, Stripe, keys, telemetry, validation, entitlements; operator metrics in **[`docs/funnel-observability-ssot.md`](docs/funnel-observability-ssot.md)**—disable with **`AGENTSKEPTIC_TELEMETRY=0`**). OSS builds in this repo run contract **`verify`** / **`quick`** without a license server and may emit **`--output-lock`** fixtures; **`--expect-lock`**, **`agentskeptic enforce`**, and paid compare require a commercial build per **[`docs/commercial-enforce-gate-normative.md`](docs/commercial-enforce-gate-normative.md)**. Example workflow: **[`examples/github-actions/agentskeptic-commercial.yml`](examples/github-actions/agentskeptic-commercial.yml)**.

## Status, contributing, security

**Maturity:** **0.x** (`package.json`). APIs, CLI flags, and JSON schemas may evolve; rely on tests and docs for current contracts.

**Contributing:** see **[CONTRIBUTING.md](CONTRIBUTING.md)**.

**Security:** see **[SECURITY.md](SECURITY.md)**.

## License

Released under the **MIT License** — **[LICENSE](LICENSE)**.
