/**
 * Session read-only guards: shared production code must block INSERT with read-only transaction error.
 * Uses POSTGRES_ADMIN_URL (superuser); requires pg-ci-init (readonly_probe table).
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  applyPostgresVerificationSessionGuards,
  connectPostgresVerificationClient,
  createPostgresSqlReadBackend,
} from "../dist/sqlReadBackend.js";
import { reconcileSqlRowAsync } from "../dist/reconciler.js";

const adminUrl = process.env.POSTGRES_ADMIN_URL;

describe("Postgres session read-only (applyPostgresVerificationSessionGuards)", () => {
  before(() => {
    assert.ok(adminUrl && adminUrl.length > 0, "POSTGRES_ADMIN_URL must be set (run npm run test:ci with Postgres; see README)");
  });

  it("INSERT fails with read-only transaction after guards; SELECT still succeeds", async () => {
    const client = new pg.Client({
      connectionString: adminUrl,
      connectionTimeoutMillis: 30_000,
    });
    await client.connect();
    try {
      await applyPostgresVerificationSessionGuards(client);
      await client.query("SELECT 1");
      let insertErr;
      try {
        await client.query("INSERT INTO readonly_probe VALUES (1)");
      } catch (e) {
        insertErr = e;
      }
      assert.ok(insertErr instanceof Error, "INSERT should fail under read-only session");
      const pgErr = /** @type {import('pg').DatabaseError} */ (insertErr);
      assert.equal(pgErr.code, "25006");
      const r = await client.query("SELECT 1 AS x");
      assert.equal(r.rows[0]?.x, 1);
    } finally {
      try {
        await client.end();
      } catch {
        /* cleanup */
      }
    }
  });

  it("connectPostgresVerificationClient + verification SELECT succeeds", async () => {
    const client = await connectPostgresVerificationClient(adminUrl);
    const backend = createPostgresSqlReadBackend(client);
    const out = await reconcileSqlRowAsync(backend, {
      kind: "sql_row",
      table: "contacts",
      keyColumn: "id",
      keyValue: "c_ok",
      requiredFields: { name: "Alice", status: "active" },
    });
    assert.equal(out.status, "verified");
    try {
      await client.end();
    } catch {
      /* cleanup */
    }
  });

  it("reconcileSqlRowAsync verifies INTEGER qty default 0 on c_ok", async () => {
    const client = await connectPostgresVerificationClient(adminUrl);
    const backend = createPostgresSqlReadBackend(client);
    const out = await reconcileSqlRowAsync(backend, {
      kind: "sql_row",
      table: "contacts",
      keyColumn: "id",
      keyValue: "c_ok",
      requiredFields: { qty: 0 },
    });
    assert.equal(out.status, "verified");
    try {
      await client.end();
    } catch {
      /* cleanup */
    }
  });

  it("reconcileSqlRowAsync VALUE_MISMATCH on qty with expected 1 actual 0", async () => {
    const client = await connectPostgresVerificationClient(adminUrl);
    const backend = createPostgresSqlReadBackend(client);
    const out = await reconcileSqlRowAsync(backend, {
      kind: "sql_row",
      table: "contacts",
      keyColumn: "id",
      keyValue: "c_ok",
      requiredFields: { qty: 1 },
    });
    assert.equal(out.status, "inconsistent");
    assert.equal(out.reasons[0]?.code, "VALUE_MISMATCH");
    assert.match(out.reasons[0]?.message, /^Expected .+ but found .+ for field qty$/);
    assert.equal(out.evidenceSummary.expected, "1");
    assert.equal(out.evidenceSummary.actual, "0");
    try {
      await client.end();
    } catch {
      /* cleanup */
    }
  });
});
