# execution-truth-layer

MVP **Execution Truth Layer**: verify agent workflow steps against **SQLite** ground truth using an append-only **NDJSON** event log and a **`tools.json`** registry.

Authoritative specification: **[docs/execution-truth-layer.md](docs/execution-truth-layer.md)**.

## Requirements

- **Node.js ≥ 22.13** (uses built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html))

## Quick start

```bash
npm install
npm test
```

CLI (after `npm run build`):

```bash
node dist/cli.js --workflow-id <id> --events <events.ndjson> --registry examples/tools.json --db <path-to.db>
```

See [docs/execution-truth-layer.md](docs/execution-truth-layer.md) for exit codes, schemas, the reconciler rule table, and a demo DB recipe.
