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

To run the same check through the CLI (after `npm run first-run` so `examples/demo.db` exists):

```bash
node dist/cli.js --workflow-id wf_complete --events examples/events.ndjson --registry examples/tools.json --db examples/demo.db
```

Contributors: run the full suite with `npm test`.
