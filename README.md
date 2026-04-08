# Verify agent workflows against your database—not just the logs

**One-sentence value:** After each run, this tool uses read-only SQL to check whether your database actually matches what the tool calls said should be true.

**Why that matters:** That means a green trace is no longer your only proof that customer data actually updated.

*NPM package name: `execution-truth-layer`.*

### Quick Verify (zero-config path)

This path expects structured tool activity in your paste—tool names and parameters the engine can extract as JSON—not arbitrary unstructured logs.
Verification uses read-only SQL against your database; API-only or non-SQL systems are out of scope for this tool.

Product story, audiences, TTFV, and **which doc owns which contract**: **[`docs/verification-product-ssot.md`](docs/verification-product-ssot.md)**. Ingest ladder, thresholds, and CLI ordering: **[`docs/quick-verify-normative.md`](docs/quick-verify-normative.md)** (do not duplicate those numbers here).

After **`npm run build`**, point at **JSON/NDJSON** tool activity and a **read-only** SQLite or Postgres database. Writes the **export registry** array atomically, optional synthetic **events** NDJSON, then one **`quick-verify-report`** line on **stdout**; human-readable context on **stderr** (three fixed anchor lines—see normative doc). Integrators should rely on **stdout + exit codes**, not parsed stderr prose.

```bash
npm run first-run
node dist/cli.js quick --input test/fixtures/quick-verify/pass-line.ndjson --db examples/demo.db --export-registry ./quick-export.json
```

Use **`--postgres-url "postgresql://…"`** instead of **`--db`**. Use **`-`** as **`--input`** for stdin. Optional **`--emit-events <path>`** (zero-byte file if no row tools exported), **`--workflow-id <id>`** (default **`quick-verify`**). Exit codes: **0** pass, **1** fail, **2** uncertain, **3** operational.

---

## Canonical use case

**Verify that an AI support or CRM workflow really persisted the intended update.**

The agent says the ticket or contact was updated; logs show success. This tool checks the **actual database row**. If status, owner, priority, or other required fields do not match what the tool calls said should be true, the run is marked **inconsistent**—even when the narrative looked fine.

---

## Core workflow verification

Everything below is what most teams need to try the idea and wire it into a pipeline. Optional capabilities (compare, persisted runs, hooks, registry checks) live under **[Advanced features](#advanced-features)**. **Signing**, the **Debug Console**, and **`plan-transition`** are **advanced / optional** there—integrator and power-user paths, not part of the core wedge.

### Example: before and after

| Before | After |
|--------|--------|
| The trace says `crm.upsert_contact` ran and returned OK. You assume the row exists with the right fields. | You replay the same tool log against your DB. If the row is missing or fields do not match, you get a **clear mismatch**—even when the agent transcript looked fine. |

The bundled demo uses workflow **`wf_complete`** (log and DB agree) and **`wf_missing`** (the tool calls imply a contact id that is **not** in the database).

### Quickstart

**Prerequisite:** **Node.js ≥ 22.13** (uses built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html))—or skip local Node and use **[Docker quickstart](#docker-quickstart-optional)**.

1. **`npm install`** in the repo root.
2. **`npm start`** — runs a build, seeds **`examples/demo.db`**, then runs the two demo workflows from **`examples/events.ndjson`** and **`examples/tools.json`**.
3. **Scan the output** — first case should end in **`complete` / `verified`**; second in **`inconsistent` / `missing`** with reason **`ROW_ABSENT`**. That contrast is the product in one screen.

```bash
npm install
npm start
```

`npm install` does not compile TypeScript. For **`node dist/cli.js`** without `npm start`, run **`npm run build`** first so **`dist/`** exists.

### Docker quickstart (optional)

Use this when you want the bundled demo without installing Node or matching **22.13+** on the host. The repo is bind-mounted so **`examples/demo.db`** and any edits stay on your machine.

**Bash / macOS / Linux** (run from the repo root):

```bash
docker run --rm -it -v "$PWD:/work" -w /work node:22-bookworm bash -lc "npm install && npm start"
```

**PowerShell** (repo root):

```powershell
docker run --rm -it -v "${PWD}:/work" -w /work node:22-bookworm bash -lc "npm install && npm start"
```

For ad hoc CLI runs after that, add **`npm run build`** to the same pattern, or run **`node dist/cli.js ...`** inside a container the same way (mount + **`-w /work`**).

### Sample output

The demo prints a **human verification report** and **workflow result JSON** per workflow. (The demo sends both to **stdout**; for normal CLI behavior, see the **[Human truth report](docs/execution-truth-layer.md#human-truth-report)** section in the authoritative reference.)

#### Success case (`wf_complete`)

Human report (excerpt):

```text
workflow_id: wf_complete
workflow_status: complete
trust: TRUSTED: Every step matched the database under the configured verification rules.
steps:
  - seq=0 tool=crm.upsert_contact result=Matched the database.
```

Machine result (excerpt):

```json
{
  "schemaVersion": 14,
  "workflowId": "wf_complete",
  "status": "complete",
  "steps": [{ "seq": 0, "toolId": "crm.upsert_contact", "status": "verified" }]
}
```

*Interpretation:* The workflow is safe to trust for this step because **what the tool calls said should be true** matches the database.

#### Failure case (`wf_missing`)

Human report (excerpt):

```text
workflow_id: wf_missing
workflow_status: inconsistent
steps:
  - seq=0 tool=crm.upsert_contact result=Expected row is missing from the database (the log implies a write that is not present).
    reference_code: ROW_ABSENT
```

Machine result (excerpt):

```json
{
  "schemaVersion": 14,
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

*Interpretation:* The workflow claimed a write, but the **expected row is not there**, so the run is flagged **inconsistent**—the kind of gap traces alone often miss.

Run **`npm start`** to see the full reports and JSON on your machine.

### Use it on your own system

1. **Emit one NDJSON line per tool call** after each observation (shape: [Event line schema](docs/execution-truth-layer.md#event-line-schema) in the authoritative reference).
2. **Add a registry entry** for each `toolId` (start from **`examples/templates/`**).
3. **Run verification** against your DB:

```bash
npm run build
node dist/cli.js --workflow-id <id> --events <path> --registry <path> --db <sqlitePath>
```

**Postgres** (exactly one of **`--db`** or **`--postgres-url`**):

```bash
node dist/cli.js --workflow-id <id> --events <path> --registry <path> --postgres-url "postgresql://user:pass@host:5432/dbname"
```

Replay the bundled demo without `npm start`:

```bash
npm run build
node dist/cli.js --workflow-id wf_complete --events examples/events.ndjson --registry examples/tools.json --db examples/demo.db
```

**Why SQLite in the demo:** file-backed ground truth with no Docker. **Permissions (demo):** creates **`examples/demo.db`**; verification still uses read-only SQL against that file.

## Who this is for

**This is for you if** you run agent or automation workflows against **real databases** (SQLite, Postgres, or anything you can mirror into SQL), you own **reliability or compliance**, and you have seen symptoms like “the assistant said it saved, but the record is wrong or missing.”

**This is not for you if** you only need generic request tracing with no notion of **expected rows/fields**, or you have no **SQL-accessible ground truth** to compare against.

## How it works

Retries, partial failures, and race conditions mean a success log is not proof that the intended row exists with the right values. This tool takes **append-only NDJSON** tool observations plus a small **`tools.json`** registry, derives what should be true in SQL, and verifies that state with **read-only `SELECT`s**.

## How this differs from logs, tests, and observability

| Approach | What it tells you |
|----------|-------------------|
| **Logs / traces** | A step ran, duration, errors—**not** “row X has columns Y.” |
| **Unit / integration tests** | Code paths in **your** repo—**not** production agent runs against live DB state. |
| **Metrics / APM** | Health and latency—**not** semantic equality of persisted records. |
| **Database-backed verification (this tool)** | For each step, **whether the database matches what the tool calls said should be true**, using **read-only SQL**. |

## When to run it

Run **after** a workflow (or CI replay of its log), **before** you treat the outcome as safe for customer-facing or regulated actions.

**Inputs:** NDJSON observations, **`tools.json`**, and **read-only** access to **SQLite** or **Postgres**. Relational verification semantics: [`docs/relational-verification.md`](docs/relational-verification.md).

**Typical uses:** block a release, trigger human review, open an incident, or attach a verification artifact to an audit trail.

---

## Advanced features

The items below are **optional**. Full detail (schemas, CLI I/O, Postgres session guards, compare inputs, and more) is in **[docs/execution-truth-layer.md](docs/execution-truth-layer.md)**—not duplicated here. **Cryptographic signing**, the **Debug Console**, and **`plan-transition`** are **advanced / optional** in that doc as well; most adopters never need them to get value from SQL-backed verification.

| Area | What it is |
|------|------------|
| **Cross-run compare** | `verify-workflow compare` over saved results—trend and reliability summaries. See [Cross-run comparison](docs/execution-truth-layer.md#cross-run-comparison-normative). |
| **Execution trace view** | `execution-trace` CLI for model + tools + control in one NDJSON. See [End-to-end execution visibility](docs/execution-truth-layer.md#end-to-end-execution-visibility-normative). |
| **In-process hook** | SQLite-only **`withWorkflowVerification`** — [Low-friction integration](docs/execution-truth-layer.md#low-friction-integration-in-process). |
| **Registry-only check** | `validate-registry --registry <path>` — [Registry validation](docs/execution-truth-layer.md#registry-validation-validate-registry--normative). |
| **Run bundles (advanced / optional)** | Persist **`events`**, **`workflow-result`**, and a manifest for audit and reload. **Ed25519 signing** is an extra on top, not required for the bundle layout. See [Agent run record](docs/execution-truth-layer.md#agent-run-record-canonical-bundle) and [Signing](docs/execution-truth-layer.md#cryptographic-signing-of-workflow-result-normative). |
| **Debug Console (advanced / optional)** | Local UI for corpus loads, compare panel, run-trust panel. See [Debug Console](docs/execution-truth-layer.md#debug-console-normative); UI tests: **`npm run test:debug-ui`**. |
| **Plan transition validation (advanced / optional)** | `plan-transition` subcommand: git diff vs machine-checkable rules in a plan markdown file—separate from SQL verification. See [Plan transition validation](docs/execution-truth-layer.md#plan-transition-validation-normative). |

**CLI reference** (streams, exit codes, human vs machine output, schema versions for compare/bundles): see **[Human truth report](docs/execution-truth-layer.md#human-truth-report)** and **[CLI operational errors](docs/execution-truth-layer.md#cli-operational-errors)** in the authoritative reference.

## Development and testing

### Local validation

```bash
npm test
```

Runs build, Vitest, SQLite Node tests, and the first-run demo. No Postgres required.

### CI (Postgres + optional Debug UI)

For the full suite (matches [`.github/workflows/ci.yml`](.github/workflows/ci.yml)), set **`POSTGRES_ADMIN_URL`** and **`POSTGRES_VERIFICATION_URL`**, then **`npm run test:ci`** (includes Playwright for the **advanced / optional** Debug Console). Example local server: `docker run -d --name etl-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16` — then export the same URL pattern CI uses (see workflow file).

## License

Released under the **MIT License** — see **[LICENSE](LICENSE)**.
