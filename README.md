# execution-truth-layer

MVP **Execution Truth Layer**: verify agent workflow steps against **SQLite** ground truth using an append-only **NDJSON** event log and a **`tools.json`** registry.

Authoritative specification: **[docs/execution-truth-layer.md](docs/execution-truth-layer.md)**.

## Requirements

- **Node.js ≥ 22.13** (uses built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html))

## Quick start

```bash
npm install
npm run first-run
```

The first run uses bundled `examples/events.ndjson` and `examples/tools.json`. It creates `examples/demo.db` from `examples/seed.sql` (this file is gitignored), verifies workflow `wf_complete` against the database (expect **complete** / **verified**), then verifies `wf_missing` (expect **inconsistent** / **missing** / **ROW_ABSENT**). You see both a passing and a failing verification without authoring your own events or registry.

Each JSON object printed for a workflow matches [`schemas/workflow-result.schema.json`](schemas/workflow-result.schema.json).

**In-process hook (single boundary):** see [Low-friction integration (in-process)](docs/execution-truth-layer.md#low-friction-integration-in-process) in the SSOT — one `await withWorkflowVerification` at the workflow root vs. NDJSON batch when you already log to a file.

Try the runnable demo (temp DB + one `observeStep`):

```bash
npm run example:workflow-hook
```

To run the same check through the CLI (after `npm run first-run` so `examples/demo.db` exists):

```bash
node dist/cli.js --workflow-id wf_complete --events examples/events.ndjson --registry examples/tools.json --db examples/demo.db
```

For the CLI, a **human-readable verification report** is written to **stderr** and the machine-readable **workflow result JSON** to **stdout**; full format, defaults, and stream order are specified only in the SSOT section **[Human truth report](docs/execution-truth-layer.md#human-truth-report)**.

Contributors: run the full suite with `npm test`.
