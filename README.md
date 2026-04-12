<!-- discovery-readme-title:start -->
# AgentSkeptic — when traces say success but your database does not match
<!-- discovery-readme-title:end -->

<!-- discovery-acquisition-fold:start -->
## Your workflow said it worked. Did the database actually change?

AgentSkeptic answers with read-only SQL at verification time—not with trace success flags or chat narratives.

Teams ship agent and automation workflows where traces, tool responses, and success flags look green while the database row is missing, stale, or wrong. AgentSkeptic closes that gap by comparing structured tool activity to read-only SQL against your SQLite or Postgres at verification time: it tells you whether observed state matched expectations derived from what the workflow claimed—not whether a step narrative sounded successful. It is a snapshot check, not proof of causality or execution.

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

[Why traces are not database truth](https://agentskeptic.com/database-truth-vs-traces)
<!-- discovery-acquisition-fold:end -->

**One-sentence value:** Read-only SQL checks that your database **at verification time** matches **expectations derived from structured tool activity**—not whether a trace step “succeeded.”

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

**Prerequisite:** **Node.js ≥ 22.13** (built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html)), or use [Docker](#docker-quickstart-optional) below.

**Fast first run on your own DB (bundled partner files):** after `npm install` and `npm run build`, run **`npm run partner-quickstart`** from the repo root (SQLite temp DB). Commands reference: **[`docs/partner-quickstart-commands.md`](docs/partner-quickstart-commands.md)**; narrative: **[`docs/first-run-integration.md`](docs/first-run-integration.md)** and **`/integrate`** on the site.

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

## Canonical use case

**AI support or CRM-style workflows:** structured activity says the ticket or contact should look a certain way; the trace may still show success. This tool compares **expected** row shape from that activity to **observed** SQL—**inconsistent** when the row is wrong or missing, even when the narrative looked fine.

## How to run the CLI

- **After `npm install` and `npm run build` in this repo:** use **`agentskeptic`** (from `package.json` `bin`, pointing at `dist/cli.js`). Examples: `npm run agentskeptic -- --help` or `npx agentskeptic --help` from the repo root.
- **From a published install** (when you install the `agentskeptic` package): same command—**`agentskeptic`** on your `PATH`.
- **Explicit path from source:** **`node dist/cli.js`** — same entrypoint as **`agentskeptic`**; use this when you want a literal path after **`npm run build`**.

Postgres: use **`--postgres-url "postgresql://…"`** instead of **`--db <sqlitePath>`** (exactly one of the two).

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

**This is for you if** you need SQL ground truth for persisted rows after agent or automation workflows—when the trace looks fine but the database might not be.

**This is not for you if** you need proof a tool executed, generic log search as verification, or a system where read-only SQL against your app DB is not the right check.

**Trust boundary (once):** a green trace or OK tool response does **not** prove the row you care about exists with the right values. This tool only shows whether **read-only `SELECT`s** at verification time matched **expected** rows/fields under your rules—**not** causality or execution correctness in the deep sense.

**Web-facing qualification** (“for you” / “not for you” on the commercial site) is maintained in **`website/src/content/productCopy.ts`** so homepage copy does not drift from a second source in this README.

**Declared → expected → observed** (how reports reason about runs):

1. **Declared** — what the captured tool activity encodes (`toolId`, parameters).
2. **Expected** — what should hold in SQL under the rules (in **Quick Verify**, inferred; in **contract mode**, registry-driven from events).
3. **Observed** — what read-only SQL returned at verification time.

## Contract path (registry + events)

Typical integration:

1. Emit **one NDJSON line per tool observation** (see [Event line schema](docs/agentskeptic.md#event-line-schema)).
2. Add a **registry** entry per `toolId` (start from **`examples/templates/`**).
3. Run verification:

```bash
npm run build
agentskeptic --workflow-id <id> --events <path> --registry <path> --db <sqlitePath>
```

Replay the bundled demo:

```bash
npm run build
agentskeptic --workflow-id wf_complete --events examples/events.ndjson --registry examples/tools.json --db examples/demo.db
```

**From source without `agentskeptic` on PATH:** `node dist/cli.js` with the same flags.

**Why SQLite in the demo:** file-backed ground truth with no extra services. The demo (re)creates **`examples/demo.db`**; verification still uses read-only SQL.

## Quick Verify (optional, zero-registry)

**Input contract:** We only accept **structured tool activity**—JSON or NDJSON that describes tool calls and parameters our ingest model can extract—not arbitrary logs, traces, or unstructured observability text.
Verification uses read-only SQL against your database; API-only or non-SQL systems are out of scope for this tool.

**Quick Verify** runs **`agentskeptic quick`** with structured tool activity and a DB: inferred checks, no registry file. It is **provisional**—rollup pass/fail/uncertain is **not** an audit-final verdict; prefer **contract mode** when you need explicit per-tool expectations.

Full behavior, stdout/stderr contracts, exit codes, and replay caveats: **[`docs/quick-verify-normative.md`](docs/quick-verify-normative.md)** and **[`docs/agentskeptic.md`](docs/agentskeptic.md)** (Quick Verify sections). Product framing: **[`docs/verification-product-ssot.md`](docs/verification-product-ssot.md)**.

```bash
npm run build
agentskeptic quick --input test/fixtures/quick-verify/pass-line.ndjson --db examples/demo.db --export-registry ./quick-export.json
```

Use **`--postgres-url`** instead of **`--db`**; **`-`** as **`--input`** reads stdin.

## Confidence over time (assurance)

**Trust over time** uses **`agentskeptic assurance run`** with a versioned **manifest** (multi-scenario sweep by spawning the CLI) and **`agentskeptic assurance stale`** to fail closed when a saved **`AssuranceRunReport`** is missing, invalid, or older than **`--max-age-hours`**. Bundled example manifest: **[`examples/assurance/manifest.json`](examples/assurance/manifest.json)**. Normative I/O and schemas: **[Assurance subsystem](docs/agentskeptic.md#assurance-subsystem-normative)** in **`docs/agentskeptic.md`**.

## Sample output (contract demo)

The **`npm start`** driver prints the human report and workflow JSON to **stdout** (so one stream carries the story). Normal CLI use: machine JSON on **stdout**, human report on **stderr**—see [Human truth report](docs/agentskeptic.md#human-truth-report).

### Success (`wf_complete`)

```text
workflow_id: wf_complete
workflow_status: complete
trust: TRUSTED: Every step matched the database under the configured verification rules.
steps:
  - seq=0 tool=crm.upsert_contact result=Matched the database.
```

```json
{
  "schemaVersion": 15,
  "workflowId": "wf_complete",
  "status": "complete",
  "steps": [{ "seq": 0, "toolId": "crm.upsert_contact", "status": "verified" }]
}
```

*Interpretation:* Under the configured rules, **expected** state matched **observed SQL** for this step—**state alignment**, not proof of execution.

### Failure (`wf_missing`)

```text
workflow_id: wf_missing
workflow_status: inconsistent
steps:
  - seq=0 tool=crm.upsert_contact result=Expected row is missing from the database (the log implies a write that is not present).
    reference_code: ROW_ABSENT
```

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

*Interpretation:* **Expected** state from the tool activity implied a row **observed SQL** did not find—**inconsistent**—a gap traces alone often miss. Still not proof a write was attempted or rolled back.

## How this differs from logs, tests, and observability

| Approach | What it tells you |
|----------|-------------------|
| **Logs / traces** | A step ran, duration, errors—not “row X has columns Y.” |
| **Unit / integration tests** | Code paths in your repo—not production agent runs against live DB state. |
| **Metrics / APM** | Health and latency—not semantic equality of persisted records. |
| **agentskeptic** | Whether **observed SQL** matches **expectations from declared tool parameters** (contract mode), via read-only SQL—not proof the tool executed. |

## When to run it

Run **after** a workflow (or CI replay of its log), **before** you treat the outcome as safe for customer-facing or regulated actions.

**Inputs:** NDJSON observations, registry JSON, read-only **SQLite** or **Postgres**. Semantics: [`docs/relational-verification.md`](docs/relational-verification.md).

**Typical uses:** block a release, trigger human review, open an incident, or attach a verification artifact to an audit trail.

**CI with pinned outcomes:** **`agentskeptic enforce`** and committed **`ci-lock-v1`** fixtures—[`docs/ci-enforcement.md`](docs/ci-enforcement.md).

## Advanced features

Optional capabilities; full detail in **[`docs/agentskeptic.md`](docs/agentskeptic.md)**.

| Area | Entry |
|------|--------|
| **Cross-run compare** | `agentskeptic compare` — [Cross-run comparison](docs/agentskeptic.md#cross-run-comparison-normative) |
| **Execution trace** | `agentskeptic execution-trace` — [End-to-end execution visibility](docs/agentskeptic.md#end-to-end-execution-visibility-normative) |
| **In-process hook** | SQLite **`withWorkflowVerification`** — [Low-friction integration](docs/agentskeptic.md#low-friction-integration-in-process) |
| **Registry validation** | `agentskeptic validate-registry` — [Registry validation](docs/agentskeptic.md#registry-validation-validate-registry--normative) |
| **Run bundles / signing** | [Agent run record](docs/agentskeptic.md#agent-run-record-canonical-bundle), [Signing](docs/agentskeptic.md#cryptographic-signing-of-workflow-result-normative) |
| **Debug Console** | `agentskeptic debug` — [Debug Console](docs/agentskeptic.md#debug-console-normative) |
| **Plan transition** | `agentskeptic plan-transition` — [Plan transition validation](docs/agentskeptic.md#plan-transition-validation-normative) |

Streams, exit codes, and operational errors: [Human truth report](docs/agentskeptic.md#human-truth-report), [CLI operational errors](docs/agentskeptic.md#cli-operational-errors).

## Documentation map

| Doc | Purpose |
|-----|---------|
| [`docs/agentskeptic.md`](docs/agentskeptic.md) | Authoritative CLI and behavior reference (SSOT) |
| [`docs/quick-verify-normative.md`](docs/quick-verify-normative.md) | Quick Verify normative contract |
| [`docs/verification-product-ssot.md`](docs/verification-product-ssot.md) | Product story and doc ownership |
| [`docs/relational-verification.md`](docs/relational-verification.md) | Relational verification semantics |
| [`docs/ci-enforcement.md`](docs/ci-enforcement.md) | CI enforcement and lock fixtures |
| [`docs/correctness-definition-normative.md`](docs/correctness-definition-normative.md) | Correctness and limits (normative) |

## Development and testing

**Why SQLite in the demo:** file-backed ground truth with no extra services. The demo (re)creates **`examples/demo.db`**; verification still uses read-only SQL.

Runs build, Vitest, SQLite Node tests, first-run demo, `assurance run`, the commercial enforce test harness (minimal CI enforcement + enforce integration tests), and TTFV validation. No Postgres required.

**Full CI parity** (Postgres + Debug Console UI tests): set **`POSTGRES_ADMIN_URL`** and **`POSTGRES_VERIFICATION_URL`**, then **`npm run test:ci`**—see [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Example Postgres: `docker run -d --name etl-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`.

## Commercial CLI (npm) vs OSS (this repo)

- **Default `npm run build`** uses **`WF_BUILD_PROFILE=oss`**: contract **`verify`** does **not** call a license server or require **`AGENTSKEPTIC_API_KEY`**. **`enforce`** and **`--output-lock` / `--expect-lock`** on batch or **`quick`** are **unavailable** in this profile — see **[`docs/commercial-enforce-gate-normative.md`](docs/commercial-enforce-gate-normative.md)**. Use OSS builds for local development, forks, and air-gapped **`verify`**.
- **Published npm (commercial profile)** is built with **`npm run build:commercial`** and **`COMMERCIAL_LICENSE_API_BASE_URL`**; it **requires** an API key, an **active subscription** (Individual, Team, or Business self-serve, or Enterprise; trial counts) for **licensed** **batch**, **`quick`**, **CI lock flags**, and **`enforce`**, and successful **`POST /api/v1/usage/reserve`** preflight. **Entitlement matrix:** **[`docs/commercial-entitlement-matrix.md`](docs/commercial-entitlement-matrix.md)** (generated). **Policy:** **[`docs/commercial-entitlement-policy.md`](docs/commercial-entitlement-policy.md)**. **Machine contracts:** **`GET /api/v1/commercial/plans`** and **`/openapi-commercial-v1.yaml`** — **[`docs/commercial-ssot.md`](docs/commercial-ssot.md)**.
- **Production CI** should install **`agentskeptic@latest`** from npm, set **`AGENTSKEPTIC_API_KEY`** (legacy **`WORKFLOW_VERIFIER_API_KEY`** still accepted), and use a reachable license API. Example: **[`examples/github-actions/agentskeptic-commercial.yml`](examples/github-actions/agentskeptic-commercial.yml)**.
- **Website + billing:** [`website/`](website/), **[`docs/commercial-ssot.md`](docs/commercial-ssot.md)**. First-run on your DB: **[`docs/first-run-integration.md`](docs/first-run-integration.md)** and **`/integrate`**.
- **Validation:** `npm run validate-commercial` requires **`DATABASE_URL`**, runs **`drizzle-kit migrate`**, runs website Vitest, then **`scripts/pack-smoke-commercial.mjs`** (commercial **`npm pack`** gate), then **`npm run build`** to restore OSS **`dist/`**, and writes [`artifacts/commercial-validation-verdict.json`](artifacts/commercial-validation-verdict.json). Optional: set **`COMMERCIAL_LICENSE_API_BASE_URL`** for the pack-smoke step (defaults to `https://pack-smoke.example.com`). Set **`COMMERCIAL_VALIDATE_PLAYWRIGHT=1`** for Playwright; see **`scripts/run-commercial-e2e.mjs`**. Quick pack check only: **`npm run pack-smoke`** (requires **`COMMERCIAL_LICENSE_API_BASE_URL`** for a real commercial build, or uses the script default URL).

## Status, contributing, security

**Maturity:** **0.x** (`package.json`). APIs, CLI flags, and JSON schemas may evolve; rely on tests and docs for current contracts.

**Contributing:** see **[CONTRIBUTING.md](CONTRIBUTING.md)**.

**Security:** see **[SECURITY.md](SECURITY.md)**.

## License

Released under the **MIT License** — **[LICENSE](LICENSE)**.
