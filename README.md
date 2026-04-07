# execution-truth-layer

## The problem (and cost of ignoring it)

Agent workflows call tools that **claim** they wrote to CRMs, tickets, or internal databases. In practice, retries, partial failures, bad IDs, and race conditions mean the **log line that says “success” is not proof** the row you care about exists with the right values.

If you ignore that gap, you ship automations that **look** healthy in traces while **customers never got the update**, **downstream jobs read stale state**, or **audits cannot reconstruct what actually landed in the database**.

**Why logs and dashboards do not fix this:** they show that a tool was *invoked* or returned OK—not that **specific SQL state** matches what the workflow intended.

## Is this for you?

**This is for you if** you run agent or automation workflows against **real databases** (SQLite, Postgres, or anything you can mirror into SQL), you own **reliability or compliance**, and you have seen symptoms like “the assistant said it saved, but the record is wrong or missing.”

**This is not for you if** you only need generic request tracing with no notion of **expected rows/fields**, or you have no **SQL-accessible ground truth** to compare against.

## One idea, one example

**Idea:** After a workflow runs, take the **observed tool calls** (as NDJSON), derive **what should be true in SQL** from a small **`tools.json` registry**, and **read the database** to see if reality matches—without trusting the model’s own summary.

**Example:** The log says `crm.upsert_contact` ran for contact `c_ok` with name Alice. This tool checks the **`contacts`** table for that id and fields. If the row is missing or `name` is not Alice, you get a **clear mismatch** even when the agent transcript looked fine.

## How this differs from logs, tests, and observability

| Approach | What it tells you |
|----------|-------------------|
| **Logs / traces** | A step ran, duration, errors—**not** “row X has columns Y.” |
| **Unit / integration tests** | Code paths in **your** repo—**not** production agent runs against live DB state. |
| **Metrics / APM** | Health and latency—**not** semantic equality of persisted records. |
| **Execution truth layer** | For each step, **whether the database matches the declared intent** from the tool log, using **read-only SQL**. |

## When to run it and what you need

Run it **after** a workflow (or CI replay of its NDJSON log), **before** you treat outcomes as safe for customer-facing or regulated actions.

**Inputs:** append-only **NDJSON** of tool observations, a **`tools.json`** registry (maps `toolId` → how to build a verification query from `params`), and **read-only** access to **SQLite** or **Postgres**.

**Decisions it enables:** block release, trigger human review, open an incident, or attach a signed verification artifact to an audit trail.

**Trust:** Verdicts come from **parameterized `SELECT`s** against real rows, not from the agent’s natural-language conclusion. Structured **`workflowTruthReport`** on stdout JSON holds machine-stable labels; the **human report** (stderr from the CLI, or stdout in the demo below) spells out what was expected, what was checked, and what failed in plain language.

## Try it in under five minutes

**Requirements**

- **Node.js ≥ 22.13** (uses built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html))
- **Runtime dependency [`pg`](https://node-postgres.com/)** when using Postgres verification paths

```bash
npm install
npm start
```

**`npm install`** does **not** run TypeScript compilation (there is no **`prepare`** hook). After clone, run **`npm run build`** before **`node dist/cli.js`** so **`dist/`** exists and FailureOrigin types are synced from the schema.

**`npm start`** runs **`npm run build`** then **`node scripts/first-run.mjs`**: it seeds **`examples/demo.db`** from **`examples/seed.sql`**, then runs two workflows from bundled **`examples/events.ndjson`** and **`examples/tools.json`** (below). **`npm run first-run`** alone only runs that demo step—use it when **`dist/`** is already built.

**Workflow result stdout:** emitted JSON uses **`schemaVersion` `11`**. The **`runLevelCodes`** property is **not** present on v11 objects; use **`runLevelReasons[].code`** when you need run-level codes. Frozen **v9** documents (with **`runLevelCodes`**) exist **only** for compare ingress and corpus bundles—see [`schemas/workflow-result-v9.schema.json`](schemas/workflow-result-v9.schema.json) and compare-input **`oneOf`** in [`schemas/workflow-result-compare-input.schema.json`](schemas/workflow-result-compare-input.schema.json) (**engine v7 → frozen v9 → stdout v11**). CI machine I/O contract: [`test/ci-workflow-truth-postgres-contract.test.mjs`](test/ci-workflow-truth-postgres-contract.test.mjs) / **`npm run test:workflow-truth-contract`**.

1. **`wf_complete`** — the log matches the database → **complete** / **verified** in the JSON.
2. **`wf_missing`** — the log claims a contact id that **does not exist** in the DB → **inconsistent** / **missing** with reason code **`ROW_ABSENT`** in the JSON (a failure that is easy to miss if you only read the agent’s narrative).

You get short framing text, a **human verification report** on **stdout** (demo only—the CLI sends the same text to **stderr**; see SSOT), and **workflow result JSON** per run.

**Why SQLite first:** no Docker or hosted DB—file-backed ground truth so you can judge the idea immediately.

**Permissions (demo):** read/write only to create **`examples/demo.db`**; verification uses read-only SQLite as in the spec.

## Use it on your own system (smallest path)

1. **Emit one NDJSON line per tool call** after each observation (shape in **[Event line schema](docs/execution-truth-layer.md#event-line-schema)**).
2. **Add a registry entry** for each `toolId` (start from **`examples/templates/`**).
3. **Run verification** against your DB:

```bash
npm run build
node dist/cli.js --workflow-id <id> --events <path> --registry <path> --db <sqlitePath>
```

Postgres: exactly one of **`--db`** or **`--postgres-url`**:

```bash
node dist/cli.js --workflow-id <id> --events <path> --registry <path> --postgres-url "postgresql://user:pass@host:5432/dbname"
```

**Execution trace (model + tools + control in one NDJSON):** `node dist/cli.js execution-trace --workflow-id <id> --events <path>` emits **`ExecutionTraceView`** JSON (optional `--workflow-result` / `--format text`). Spec: [End-to-end execution visibility](docs/execution-truth-layer.md#end-to-end-execution-visibility-normative).

**In-process (SQLite only):** **`npm run example:workflow-hook`** — **`await withWorkflowVerification`** at the workflow root; see **[Low-friction integration (in-process)](docs/execution-truth-layer.md#low-friction-integration-in-process)**.

## Canonical agent run bundle

Saved runs that the Debug Console (or **`loadCorpusRun`**) can load as **`ok`** require **three files** per run directory: **`events.ndjson`**, **`workflow-result.json`**, and **`agent-run.json`** (a SHA-256 manifest—no separate **`meta.json`**). After **`verify-workflow`**, emit that layout with **`--write-run-bundle <dir>`** or **`writeAgentRunBundle`** from the package entry. Full contract, **`workflowVerdictSurface`**, programmatic retrieve path, and error codes: **[Slice 5 — workflow verdict and audit](docs/execution-truth-layer.md#slice-5-workflow-verdict-and-audit)** and **[Agent run record (canonical bundle)](docs/execution-truth-layer.md#agent-run-record-canonical-bundle)**.

## Authoritative specification

**[docs/execution-truth-layer.md](docs/execution-truth-layer.md)** is the single source of truth for schemas, CLI I/O, Postgres guards, and module roles.

**CI workflow truth contract** (Postgres CLI, machine-readable **`verify-workflow`** I/O): **[CI workflow truth contract (Postgres CLI)](docs/execution-truth-layer.md#ci-workflow-truth-contract-postgres-cli)**.

## Automation and CLI (short)

For **`verify-workflow`**, a **human-readable verification report** is written to **stderr** and the machine-readable **workflow result JSON** to **stdout** on verdict exits **0–2**; operational failures use exit **3** with a **single-line JSON error** on stderr (see [CLI operational errors](docs/execution-truth-layer.md#cli-operational-errors)). Full format: **[Human truth report](docs/execution-truth-layer.md#human-truth-report)**. Use **`--no-truth-report`** for empty stderr on verdict paths when piping logs. Use **`--write-run-bundle <dir>`** on verdict exits **0–2** to write a sealed **[canonical bundle](docs/execution-truth-layer.md#agent-run-record-canonical-bundle)**. Exit codes: **0** complete, **1** inconsistent, **2** incomplete, **3** operational.

After **`npm start`**, replay the demo workflows:

```bash
node dist/cli.js --workflow-id wf_complete --events examples/events.ndjson --registry examples/tools.json --db examples/demo.db
```

**Cross-run comparison:** `node dist/cli.js compare --prior earlier.json --current latest.json` — [Cross-run comparison (normative)](docs/execution-truth-layer.md#cross-run-comparison-normative).

## Slice 6 — Compare and trust surfaces

Compare **stdout** is **`RunComparisonReport`** with **`schemaVersion` `3`** only (see [Cross-run comparison (normative)](docs/execution-truth-layer.md#cross-run-comparison-normative) for breaking change from saved v2 compare outputs). The Debug Console serves **server-rendered HTML** for the compare panel and run-trust panel (`comparePanelHtml`, `runTrustPanelHtml`); success response key sets are specified in [Slice 6 — Compare runs + independent verification](docs/execution-truth-layer.md#slice-6--compare-runs--independent-verification) in the SSOT. End-to-end UI coverage: **`npm run test:debug-ui`** (Playwright; **`npm run test:ci`** installs Chromium and runs it last).

**Plan transition (git + plan markdown):** `node dist/cli.js plan-transition --repo <dir> --before <ref> --after <ref> --plan <path>` — validates `git diff -z --name-status` against rules from YAML front matter **`planValidation`**, a **`## Repository transition validation`** body YAML fence ([`plan-validation-core.schema.json`](schemas/plan-validation-core.schema.json)), or **derived path citations as required diff surfaces** when neither is present (each cited path must appear in the diff — see SSOT). Emits **`WorkflowResult`** (default **`workflowId` `wf_plan_transition`**). Requires **Git ≥ 2.30.0**. Spec: [Plan transition validation (normative)](docs/execution-truth-layer.md#plan-transition-validation-normative).

**Validate registry (no database):** `node dist/cli.js validate-registry --registry examples/tools.json` — [Registry validation (`validate-registry`) — normative](docs/execution-truth-layer.md#registry-validation-validate-registry--normative).

## Local validation (no Postgres)

```bash
npm test
```

Runs **`npm run build`**, **`npm run test:vitest`**, SQLite-only **`npm run test:node:sqlite`**, and **`scripts/first-run.mjs`**. No **`POSTGRES_*`** variables required.

## Full CI suite (Postgres)

```bash
docker run -d --name etl-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
export POSTGRES_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres
export POSTGRES_VERIFICATION_URL=postgresql://verifier_ro:verifier@127.0.0.1:5432/postgres
npm run test:ci
```

(On Windows PowerShell, use `$env:POSTGRES_ADMIN_URL="..."`.) Matches [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Advanced topics (normative detail only in SSOT)

Schema versions (**`schemaVersion` `11`** on emitted **`WorkflowResult`** without **`runLevelCodes`**, engine shape **`7`**, truth subtree **`schemaVersion` `5`** with **`failureAnalysis`**, **`actionableFailure`**, **`executionPathFindings`**, **`executionPathSummary`**, and **`verificationRunContext`**), **`workflowTruthReport`**, **`verificationPolicy`**, **`eventSequenceIntegrity`**, **`failureDiagnostic`**, CLI stderr envelope **`schemaVersion` `2`** with **`failureDiagnosis`** (including **`actionableFailure`**), **`verify-workflow compare`** inputs (**`workflow-result-compare-input.schema.json`**: engine v7 / frozen v9 / stdout v11) and **`RunComparisonReport`** v3 (**`reliabilityAssessment`**, **`compareHighlights`**, plus prior aggregates), **strong** vs **eventual** consistency, Postgres session guards, and **`test:workflow-truth-contract`** / **`ci-workflow-truth-postgres-contract.test.mjs`** are specified in **[docs/execution-truth-layer.md](docs/execution-truth-layer.md)**—not duplicated here.

## License

Released under the **MIT License** — see **[LICENSE](LICENSE)**.
