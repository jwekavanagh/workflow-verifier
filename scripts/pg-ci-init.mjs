#!/usr/bin/env node
/**
 * Idempotent Postgres schema for CI/local `npm test`.
 * Requires POSTGRES_ADMIN_URL (superuser). Creates verifier_ro + seed tables + readonly_probe.
 */
import pg from "pg";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
if (!adminUrl || adminUrl.trim() === "") {
  console.error("pg-ci-init: set POSTGRES_ADMIN_URL (e.g. postgresql://postgres:postgres@127.0.0.1:5432/postgres)");
  process.exit(1);
}

const seedSql = `
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS dups CASCADE;
DROP TABLE IF EXISTS readonly_probe CASCADE;

CREATE TABLE dups (
  k TEXT NOT NULL,
  v TEXT
);
INSERT INTO dups VALUES ('dupkey', 'a'), ('dupkey', 'b');

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT,
  qty INTEGER NOT NULL DEFAULT 0
);

INSERT INTO contacts (id, name, status) VALUES ('c_ok', 'Alice', 'active');
INSERT INTO contacts (id, name, status) VALUES ('c_partial', NULL, 'pending');
INSERT INTO contacts (id, name, status) VALUES ('c_bad', 'Bob', 'wrong');
INSERT INTO contacts (id, name, status) VALUES ('c_side', 'Side', 'active');

CREATE TABLE readonly_probe (x int);
`;

const client = new pg.Client({ connectionString: adminUrl });
await client.connect();

await client.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'verifier_ro') THEN
    CREATE ROLE verifier_ro LOGIN PASSWORD 'verifier';
  ELSE
    ALTER ROLE verifier_ro PASSWORD 'verifier';
  END IF;
END
$$;
`);

await client.query(seedSql);

await client.query(`
GRANT CONNECT ON DATABASE postgres TO verifier_ro;
GRANT USAGE ON SCHEMA public TO verifier_ro;
GRANT SELECT ON contacts TO verifier_ro;
GRANT SELECT ON dups TO verifier_ro;
`);

await client.end();
console.log("pg-ci-init: schema ready");
