# State verification for agent-driven systems

**Product in one line:** A **state verification engine**—not a logging, tracing, or monitoring product—that uses **read-only SQL** to compare **current database state** to **expectations derived from structured tool activity** (quick path: inferred; contract path: registry + events).

**One-sentence value:** After each run, read-only `SELECT`s check whether the database **at verification time** matches what your expectations say should be true—not whether a step “ran” or “succeeded” in a trace.

**Why that matters:** A green trace or successful tool response is **not** the same as proof that the row you care about exists with the right values.

*NPM package name: `workflow-verifier`.*

## What this product is

A **state verification engine** for agent and automation workflows: it uses **read-only SQL** against **SQLite or Postgres** to compare **observed database rows** to **expectations** derived from **structured tool activity** (NDJSON events plus, in contract mode, a tool registry). Quick Verify infers checks from declared parameters; contract mode uses explicit registry rules.

| This **is** | This is **not** |
|-------------|-----------------|
| A **SQL ground-truth state check** against explicit or inferred expectations | Generic observability, log search, or “paste any logs” |
| A verifier for **persisted state** after agent or automation workflows | A test runner for application code |
| Proof of **state–expectation alignment** at a point in time | Proof of execution or causality |

**Declared vs expected vs observed** (mental model used in reports and docs):

1. **Declared** — What the captured **tool activity** encodes (tool id / name and parameters extracted from ingest).
2. **Expected** — What we derive should hold in SQL: in **quick** mode, **inferred** row/FK checks from declared parameters (provisional); in **contract** mode, **registry-defined** expectations from events.
3. **Observed** — What **read-only SQL** returned at verification time.

## What this product does

- **Runs read-only `SELECT`s** at verification time and compares results to **expected** state derived from your ingest (inferred in quick mode, registry-driven in contract mode).
- **Emits a machine-readable workflow result** (schema-versioned JSON on stdout in normal CLI use) and a **human verification report** (stderr), with **clear reason codes** when rows or fields do not match (for example **`ROW_ABSENT`**).
- **Supports Quick Verify** for a fast, zero-registry path (provisional rollup), and **contract mode** when you need explicit, auditable expectations per tool.
- **Works with SQLite and Postgres** (read-only session semantics for Postgres are documented in the authoritative reference).

## What this product does not prove

This is the trust boundary for the whole product—**Quick Verify and contract mode**:

- It does **not** prove the tool or side effect **actually executed** (only that state matched expectations when checked).
- It does **not** prove a **write or state change occurred** (you see a snapshot, not causality).
- It **only** proves that **current state matched declared or inferred expectations** under the configured rules—not “execution correctness” in the causal sense.

## Who this is for

**This is for you if** you run agent or automation workflows against **real databases** (SQLite, Postgres, or anything you can mirror into SQL), you can emit **structured tool activity** that matches the ingest model, you own **reliability or compliance**, and you have seen symptoms like “the assistant said it saved, but the record is wrong or missing.”

**This is not for you if** you only need generic request tracing with no notion of **expected rows/fields**, you have no **SQL-accessible ground truth**, or you cannot produce **structured tool calls** (not raw logs). For a fuller exclusion list, see **[Who this is not for](#who-this-is-not-for)** below.

## Who this is not for

Do **not** adopt this if:

- You do **not** have **structured tool activity** (JSON describing tool calls and parameters your pipeline can emit)—there is **no** arbitrary-log ingest.
- You do **not** have **SQL-accessible** ground truth (SQLite, Postgres, or a mirror you treat as authoritative).
- You need **causal** guarantees (“this API call definitely caused this row”)—this product checks **state**, not the causal chain.
- You want **plug-and-play** ingestion of whatever your platform logs today without shaping data to the **event / ingest model**.

If that is you, a tracing or audit-log product is a better fit; this tool will frustrate you and the feedback will not be actionable.

---

## Canonical use case

**Check that an AI support or CRM workflow left the database in the state your expectations describe.**

Structured tool activity says the ticket or contact should look a certain way; a trace may show success. This tool compares **declared parameters → expected row shape** against **observed SQL**. If required fields do not match, the run is marked **inconsistent**—even when the narrative looked fine. That is **state mismatch**, not proof the tool never ran.

---

## Core workflow verification

Everything below is what most teams need to try the idea and wire it into a pipeline. Optional capabilities (compare, persisted runs, hooks, registry checks) live under **[Advanced features](#advanced-features)**. **Signing**, the **Debug Console**, and **`plan-transition`** are **advanced / optional** there—integrator and power-user paths, not part of the core wedge.

### Quick Verify (zero-config path)

**Input contract:** We only accept **structured tool activity**—JSON or NDJSON that describes tool calls and parameters our ingest model can extract—not arbitrary logs, traces, or unstructured observability text.
Verification uses read-only SQL against your database; API-only or non-SQL systems are out of scope for this tool.

**Positioning:** Quick Verify is **provisional**. Rollup **pass** / **fail** / **uncertain** is **not** a production-safety or audit-final verdict. The stdout JSON includes a **`productTruth`** block (non-guarantees + layer definitions); stderr stresses **inferred** and **partial** scope. Prefer **contract mode** when you need explicit expectations.

Product story, audiences, TTFV, and **which doc owns which contract**: **[`docs/verification-product-ssot.md`](docs/verification-product-ssot.md)**. Ingest ladder, thresholds, and CLI ordering: **[`docs/quick-verify-normative.md`](docs/quick-verify-normative.md)** (do not duplicate those numbers here).

After **`npm run build`**, point at **JSON/NDJSON** structured tool activity and a **read-only** SQLite or Postgres database. Writes the **export registry** array atomically, optional synthetic **events** NDJSON, then one **`quick-verify-report`** line on **stdout** (`schemaVersion` **2**, includes **`productTruth`**); human-readable context on **stderr** (three fixed anchor lines—see normative doc). Integrators should rely on **stdout + exit codes**, not parsed stderr prose.

```bash
npm run first-run
node dist/cli.js quick --input test/fixtures/quick-verify/pass-line.ndjson --db examples/demo.db --export-registry ./quick-export.json
```

Use **`--postgres-url "postgresql://…"`** instead of **`--db`**. Use **`-`** as **`--input`** to stream structured tool activity on **stdin**. Optional **`--emit-events <path>`** (zero-byte file if no row tools exported), **`--workflow-id <id>`** (default **`quick-verify`**). Exit codes: **0** pass, **1** fail, **2** uncertain, **3** operational.

**Export → contract replay:** Replaying with emitted events and the exported registry checks **exported row tools only**—not full parity with quick scope (`related_exists` and other rules may be missing). See stderr footer and **`productTruth.contractReplayPartialCoverage`** on stdout.

### Example: before and after

| Before | After |
|--------|--------|
| The trace says `crm.upsert_contact` ran and returned OK. You assume the row exists with the right fields. | You run verification against your DB using **structured tool observations**. If the row is missing or fields do not match **expectations**, you get a **clear mismatch**—even when the agent transcript looked fine. |

The bundled demo uses workflow **`wf_complete`** (events and DB agree) and **`wf_missing`** (the tool activity implies a contact id that is **not** in the database).

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

The demo prints a **human verification report** and **workflow result JSON** per workflow. (The demo sends both to **stdout**; for normal CLI behavior, see the **[Human truth report](docs/workflow-verifier.md#human-truth-report)** section in the authoritative reference.)

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
  "schemaVersion": 15,
  "workflowId": "wf_complete",
  "status": "complete",
  "steps": [{ "seq": 0, "toolId": "crm.upsert_contact", "status": "verified" }]
}
```

*Interpretation:* Under the configured registry rules, **expected state from declared parameters** matched **observed SQL** for this step. That is **state alignment**, not proof of execution or causality.

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

*Interpretation:* Expectations derived from the tool activity imply a row that **observed SQL** did not find—**inconsistent**—the kind of gap traces alone often miss. This still does not prove whether a write was attempted or rolled back.

Run **`npm start`** to see the full reports and JSON on your machine.

### Use it on your own system

1. **Emit one NDJSON line per tool call** after each observation (shape: [Event line schema](docs/workflow-verifier.md#event-line-schema) in the authoritative reference).
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

## How it works

Retries, partial failures, and race conditions mean a success flag in a trace is not proof that the intended row exists with the right values. This tool takes **append-only NDJSON** structured tool observations plus a small **`tools.json`** registry, derives **expected** state in SQL, and compares it to **observed** state with **read-only `SELECT`s**.

## How this differs from logs, tests, and observability

| Approach | What it tells you |
|----------|-------------------|
| **Logs / traces** | A step ran, duration, errors—**not** “row X has columns Y.” |
| **Unit / integration tests** | Code paths in **your** repo—**not** production agent runs against live DB state. |
| **Metrics / APM** | Health and latency—**not** semantic equality of persisted records. |
| **Database-backed verification (this tool)** | For each step, **whether observed SQL state matches expectations derived from declared tool parameters** (contract mode), using **read-only SQL**—**not** proof the tool executed. |

## When to run it

Run **after** a workflow (or CI replay of its log), **before** you treat the outcome as safe for customer-facing or regulated actions.

**Inputs:** NDJSON observations, **`tools.json`**, and **read-only** access to **SQLite** or **Postgres**. Relational verification semantics: [`docs/relational-verification.md`](docs/relational-verification.md).

**Typical uses:** block a release, trigger human review, open an incident, or attach a verification artifact to an audit trail.

**CI with pinned outcomes:** use **`verify-workflow enforce`** and committed **`ci-lock-v1`** fixtures so automation fails when verification-shaped output drifts—see [`docs/ci-enforcement.md`](docs/ci-enforcement.md).

---

## Advanced features

The items below are **optional**. Full detail (schemas, CLI I/O, Postgres session guards, compare inputs, and more) is in **[docs/workflow-verifier.md](docs/workflow-verifier.md)**—not duplicated here. **Cryptographic signing**, the **Debug Console**, and **`plan-transition`** are **advanced / optional** in that doc as well; most adopters never need them to get value from SQL-backed verification.

| Area | What it is |
|------|------------|
| **Cross-run compare** | `verify-workflow compare` over saved results—trend and reliability summaries. See [Cross-run comparison](docs/workflow-verifier.md#cross-run-comparison-normative). |
| **Execution trace view** | `execution-trace` CLI for model + tools + control in one NDJSON. See [End-to-end execution visibility](docs/workflow-verifier.md#end-to-end-execution-visibility-normative). |
| **In-process hook** | SQLite-only **`withWorkflowVerification`** — [Low-friction integration](docs/workflow-verifier.md#low-friction-integration-in-process). |
| **Registry-only check** | `validate-registry --registry <path>` — [Registry validation](docs/workflow-verifier.md#registry-validation-validate-registry--normative). |
| **Run bundles (advanced / optional)** | Persist **`events`**, **`workflow-result`**, and a manifest for audit and reload. **Ed25519 signing** is an extra on top, not required for the bundle layout. See [Agent run record](docs/workflow-verifier.md#agent-run-record-canonical-bundle) and [Signing](docs/workflow-verifier.md#cryptographic-signing-of-workflow-result-normative). |
| **Debug Console (advanced / optional)** | Local UI for corpus loads, compare panel, run-trust panel. See [Debug Console](docs/workflow-verifier.md#debug-console-normative); UI tests: **`npm run test:debug-ui`**. |
| **Plan transition validation (advanced / optional)** | `plan-transition` subcommand: git diff vs machine-checkable rules in a plan markdown file—separate from SQL verification. See [Plan transition validation](docs/workflow-verifier.md#plan-transition-validation-normative). |

**CLI reference** (streams, exit codes, human vs machine output, schema versions for compare/bundles): see **[Human truth report](docs/workflow-verifier.md#human-truth-report)** and **[CLI operational errors](docs/workflow-verifier.md#cli-operational-errors)** in the authoritative reference.

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
