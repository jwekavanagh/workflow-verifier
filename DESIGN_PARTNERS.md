# Design partner path

Send this to someone who should **try it in one sitting**. Everything below is copy-pasteable; no other reading required.

## 1. What this does

- Takes an **append-only NDJSON log** of tool observations (what the agent claims it did).
- Uses a small **`tools.json` registry** to turn each call into **expected SQL row/field checks**.
- Runs **read-only `SELECT`s** against **SQLite or Postgres** and emits a **human report + machine JSON** (`complete` / `inconsistent` / `incomplete`).

## 2. What you need

| Requirement | Notes |
|-------------|--------|
| **Node.js** | **≥ 22.13** (demo uses built-in `node:sqlite`). |
| **SQLite** *or* **Postgres** | One database the verifier can reach **read-only** for checks. |
| **Docker** | Optional—handy to spin up **Postgres** locally (`postgres:16` is enough). |

From the repo root: **`npm install`** once.

## 3. Step 1: Run the demo

```bash
npm start
```

This builds, seeds **`examples/demo.db`**, runs two workflows from the bundled files, and prints reports plus JSON. You should see **`wf_complete`** end **`complete` / `verified`** and **`wf_missing`** end **`inconsistent` / `missing`** with **`ROW_ABSENT`**.

## 4. Step 2: Try on your system (minimal)

### A. Save this NDJSON as `partner-events.ndjson`

One line = one observed tool call. Use your own `workflowId`; it must match the CLI flag.

```
{"schemaVersion":1,"workflowId":"wf_partner","seq":0,"type":"tool_observed","toolId":"crm.upsert_contact","params":{"recordId":"partner_1","fields":{"name":"You","status":"active"}}}
```

### B. Save this registry as `partner-tools.json`

```json
[
  {
    "toolId": "crm.upsert_contact",
    "effectDescriptionTemplate": "Upsert contact {/recordId} with fields {/fields}",
    "verification": {
      "kind": "sql_row",
      "table": { "const": "contacts" },
      "identityEq": [
        {
          "column": { "const": "id" },
          "value": { "pointer": "/recordId" }
        }
      ],
      "requiredFields": { "pointer": "/fields" }
    }
  }
]
```

### C. Create a tiny database that matches the log

**SQLite — Node only** (same stack as the demo; works on macOS, Linux, and Windows). Save this as **`partner-seed.sql`** next to where you will run the command:

```sql
CREATE TABLE contacts (id TEXT PRIMARY KEY, name TEXT, status TEXT);
INSERT INTO contacts (id, name, status) VALUES ('partner_1', 'You', 'active');
```

Then:

```bash
node --input-type=module -e "import { readFileSync } from 'node:fs'; import { DatabaseSync } from 'node:sqlite'; const d=new DatabaseSync('partner.db'); d.exec(readFileSync('partner-seed.sql','utf8')); d.close();"
```

**SQLite — if you have the `sqlite3` CLI:**

```bash
sqlite3 partner.db < partner-seed.sql
```

**Postgres** (example—use your URL, user, and DB):

```sql
CREATE TABLE contacts (id TEXT PRIMARY KEY, name TEXT, status TEXT);
INSERT INTO contacts (id, name, status) VALUES ('partner_1', 'You', 'active');
```

### D. Run verification

**SQLite:**

```bash
npm run build
node dist/cli.js --workflow-id wf_partner --events partner-events.ndjson --registry partner-tools.json --db partner.db
```

**Postgres** (exactly one of `--db` or `--postgres-url`):

```bash
npm run build
node dist/cli.js --workflow-id wf_partner --events partner-events.ndjson --registry partner-tools.json --postgres-url "postgresql://USER:PASS@HOST:5432/DBNAME"
```

To force a mismatch, delete that row or change `name`/`status` in the DB and run again—you should get **`inconsistent`** with **`ROW_ABSENT`** or a field mismatch in the report.

## 5. What success looks like

- **Exit code `0`**: stdout is one **WorkflowResult** JSON object with `"status":"complete"` and the step `"verified"`.
- **Stderr** (default) is the **human verification report** (trust line + per-step wording). Use **`--no-truth-report`** if you want stderr empty and JSON-only on stdout.

Example stdout (one JSON object; `schemaVersion` and nested fields evolve over releases):

```json
{
  "schemaVersion": 14,
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

## 6. Common mistakes

- **Node too old** — need **22.13+**; upgrade before `npm start`.
- **No build** — run **`npm run build`** (or **`npm start`** once) so **`dist/`** exists before calling **`node dist/cli.js`**.
- **Both or neither DB flags** — pass **exactly one** of **`--db`** or **`--postgres-url`**.
- **`--workflow-id` mismatch** — must match `workflowId` in the NDJSON lines you want verified.
- **Missing registry entry** — every `toolId` in the log needs a matching object in **`tools.json`**.
- **Params vs registry** — JSON pointers like **`/recordId`** and **`/fields`** must exist on `params` for that tool line.
- **SQLite seed command** — run it from the directory where **`partner-seed.sql`** lives (or fix the path inside **`readFileSync(...)`**).
- **Node SQLite warning** — `ExperimentalWarning: SQLite is...` on stderr is from Node; it does not mean verification failed.

---

NPM package: **execution-truth-layer**. Installed CLI name: **verify-workflow** (same flags as `node dist/cli.js`).
