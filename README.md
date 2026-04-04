# execution-truth-layer

MVP **Execution Truth Layer**: verify agent workflow steps against **SQLite** or **Postgres** ground truth using an append-only **NDJSON** event log and a **`tools.json`** registry.

Authoritative specification: **[docs/execution-truth-layer.md](docs/execution-truth-layer.md)**.

## Requirements

- **Node.js ≥ 22.13** (uses built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html))
- **Runtime dependency [`pg`](https://node-postgres.com/)** for Postgres batch/CLI verification

## Quick start

```bash
npm install
npm run first-run
```

The first run uses bundled `examples/events.ndjson` and `examples/tools.json`. It creates `examples/demo.db` from `examples/seed.sql` (this file is gitignored), verifies workflow `wf_complete` against the database (expect **complete** / **verified**), then verifies `wf_missing` (expect **inconsistent** / **missing** / **ROW_ABSENT**). You see both a passing and a failing verification without authoring your own events or registry.

Each JSON object printed for a workflow matches [`schemas/workflow-result.schema.json`](schemas/workflow-result.schema.json) (`schemaVersion` **4** with required **`verificationPolicy`** and **`eventSequenceIntegrity`**; each step includes **`repeatObservationCount`** and **`evaluatedObservationOrdinal`** — see [Retry and repeated seq](docs/execution-truth-layer.md#retry-and-repeated-seq) and [Event capture order and delayed delivery](docs/execution-truth-layer.md#event-capture-order-and-delayed-delivery-normative)). The CLI supports **strong** (default) and **eventual** consistency modes for verification timing; see [Verification policy (normative)](docs/execution-truth-layer.md#verification-policy-normative).

**In-process hook (single boundary):** see [Low-friction integration (in-process)](docs/execution-truth-layer.md#low-friction-integration-in-process) in the SSOT — one `await withWorkflowVerification` at the workflow root (**SQLite only**). For Postgres, use batch `await verifyWorkflow` or the CLI.

Try the runnable demo (temp DB + one `observeStep`):

```bash
npm run example:workflow-hook
```

To run the same check through the CLI (after `npm run first-run` so `examples/demo.db` exists):

```bash
node dist/cli.js --workflow-id wf_complete --events examples/events.ndjson --registry examples/tools.json --db examples/demo.db
```

Postgres (exactly one of `--db` or `--postgres-url`):

```bash
node dist/cli.js --workflow-id wf_complete --events examples/events.ndjson --registry examples/tools.json --postgres-url "postgresql://user:pass@host:5432/dbname"
```

For the CLI, a **human-readable verification report** is written to **stderr** and the machine-readable **workflow result JSON** to **stdout** on verdict exits **0–2**; operational failures use exit **3** with a **single-line JSON error** on stderr (see [CLI operational errors](docs/execution-truth-layer.md#cli-operational-errors)). Full format and stream order are in the SSOT **[Human truth report](docs/execution-truth-layer.md#human-truth-report)**.

**Cross-run comparison:** save each `WorkflowResult` JSON from stdout, then compare runs locally, e.g. `node dist/cli.js compare --prior earlier.json --current latest.json`. Semantics and I/O are defined in **[Cross-run comparison (normative)](docs/execution-truth-layer.md#cross-run-comparison-normative)**.

## Full test suite (`npm test`)

`npm test` runs **`scripts/pg-ci-init.mjs`** against Postgres, then the Node/Vitest suites. Set:

- **`POSTGRES_ADMIN_URL`** — superuser (e.g. `postgresql://postgres:postgres@127.0.0.1:5432/postgres`)
- **`POSTGRES_VERIFICATION_URL`** — `verifier_ro` after init (e.g. `postgresql://verifier_ro:verifier@127.0.0.1:5432/postgres`)

One local Postgres 16+ instance:

```bash
docker run -d --name etl-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
export POSTGRES_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres
export POSTGRES_VERIFICATION_URL=postgresql://verifier_ro:verifier@127.0.0.1:5432/postgres
npm test
```

(On Windows PowerShell, use `$env:POSTGRES_ADMIN_URL="..."` instead of `export`.)

CI uses [`.github/workflows/ci.yml`](.github/workflows/ci.yml) with the same URL shape.
