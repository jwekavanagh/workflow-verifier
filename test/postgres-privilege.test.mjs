/**
 * SELECT-only role cannot write regardless of session (defense in depth).
 * Uses POSTGRES_VERIFICATION_URL (verifier_ro).
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const verifyUrl = process.env.POSTGRES_VERIFICATION_URL;

describe("Postgres verifier_ro privilege (SELECT only)", () => {
  before(() => {
    assert.ok(verifyUrl && verifyUrl.length > 0, "POSTGRES_VERIFICATION_URL must be set");
  });

  it("INSERT is denied (42501 insufficient_privilege)", async () => {
    const client = new pg.Client({
      connectionString: verifyUrl,
      connectionTimeoutMillis: 30_000,
    });
    await client.connect();
    try {
      let err;
      try {
        await client.query("INSERT INTO contacts (id, name, status) VALUES ('hack', 'x', 'y')");
      } catch (e) {
        err = e;
      }
      assert.ok(err instanceof Error);
      const pgErr = /** @type {import('pg').DatabaseError} */ (err);
      assert.equal(pgErr.code, "42501");
    } finally {
      try {
        await client.end();
      } catch {
        /* cleanup */
      }
    }
  });
});
