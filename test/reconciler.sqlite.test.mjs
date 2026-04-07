import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { reconcileSqlRow } from "../dist/reconciler.js";

function memDb() {
  return new DatabaseSync(":memory:");
}

function baseReq(overrides = {}) {
  return {
    kind: "sql_row",
    table: "t",
    identityEq: [{ column: "id", value: "1" }],
    requiredFields: { name: "a" },
    ...overrides,
  };
}

describe("reconcileSqlRow rule table", () => {
  it("ROW_ABSENT when no row", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)");
    const r = reconcileSqlRow(db, baseReq());
    assert.equal(r.status, "missing");
    assert.equal(r.reasons[0]?.code, "ROW_ABSENT");
    assert.match(r.reasons[0]?.message ?? "", /No row matched key \(table=t id=1\)/);
    db.close();
  });

  it("DUPLICATE_ROWS when two matches", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT, name TEXT)");
    db.exec("INSERT INTO t VALUES ('1','a'),('1','b')");
    const r = reconcileSqlRow(db, baseReq());
    assert.equal(r.status, "inconsistent");
    assert.equal(r.reasons[0]?.code, "DUPLICATE_ROWS");
    assert.match(r.reasons[0]?.message ?? "", /More than one row matched key \(table=t id=1\)/);
    db.close();
  });

  it("verified when row and fields match", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)");
    db.exec("INSERT INTO t VALUES ('1','a')");
    const r = reconcileSqlRow(db, baseReq());
    assert.equal(r.status, "verified");
    assert.equal(r.reasons.length, 0);
    db.close();
  });

  it("VALUE_MISMATCH when required column null and expected non-null (field name first)", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT, status TEXT)");
    db.exec("INSERT INTO t VALUES ('1',NULL,'x')");
    const r = reconcileSqlRow(db, baseReq({ requiredFields: { name: "x", status: "x" } }));
    assert.equal(r.status, "inconsistent");
    assert.equal(r.reasons[0]?.code, "VALUE_MISMATCH");
    assert.equal(r.reasons[0]?.field, "name");
    assert.match(r.reasons[0]?.message, /^Expected .+ but found .+ for field name \(table=t id=1\)$/);
    assert.equal(r.evidenceSummary.field, "name");
    assert.equal(r.evidenceSummary.expected, JSON.stringify("x"));
    assert.equal(r.evidenceSummary.actual, "null");
    db.close();
  });

  it("verified when expected null and column SQL NULL", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)");
    db.exec("INSERT INTO t VALUES ('1',NULL)");
    const r = reconcileSqlRow(db, baseReq({ requiredFields: { name: null } }));
    assert.equal(r.status, "verified");
    db.close();
  });

  it("VALUE_MISMATCH inconsistent for simple string mismatch", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)");
    db.exec("INSERT INTO t VALUES ('1','wrong')");
    const r = reconcileSqlRow(db, baseReq({ requiredFields: { name: "a" } }));
    assert.equal(r.status, "inconsistent");
    assert.equal(r.reasons[0]?.code, "VALUE_MISMATCH");
    assert.match(r.reasons[0]?.message, /^Expected .+ but found .+ for field name \(table=t id=1\)$/);
    db.close();
  });

  it("INTEGER column matches numeric expected", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, qty INTEGER NOT NULL DEFAULT 0)");
    db.exec("INSERT INTO t (id, qty) VALUES ('1', 3)");
    const r = reconcileSqlRow(db, baseReq({ requiredFields: { qty: 3 } }));
    assert.equal(r.status, "verified");
    db.close();
  });

  it("string expected matches numeric actual from INTEGER column", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, qty INTEGER NOT NULL DEFAULT 0)");
    db.exec("INSERT INTO t (id, qty) VALUES ('1', 42)");
    const r = reconcileSqlRow(db, baseReq({ requiredFields: { qty: "42" } }));
    assert.equal(r.status, "verified");
    db.close();
  });

  it("determinism: identical ReconcileOutput on repeat", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)");
    db.exec("INSERT INTO t VALUES ('1','a')");
    const req = baseReq();
    const a = reconcileSqlRow(db, req);
    const b = reconcileSqlRow(db, req);
    assert.deepStrictEqual(a, b);
    db.close();
  });

  it("verified with empty requiredFields when row exists (presence-only)", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)");
    db.exec("INSERT INTO t VALUES ('1','a')");
    const r = reconcileSqlRow(db, baseReq({ requiredFields: {} }));
    assert.equal(r.status, "verified");
    db.close();
  });

  it("ROW_SHAPE_MISMATCH when column missing from row", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)");
    db.exec("INSERT INTO t VALUES ('1','a')");
    const r = reconcileSqlRow(db, baseReq({ requiredFields: { missingcol: "z" } }));
    assert.equal(r.status, "incomplete_verification");
    assert.equal(r.reasons[0]?.code, "ROW_SHAPE_MISMATCH");
    db.close();
  });

  it("CONNECTOR_ERROR when table does not exist", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)");
    db.exec("INSERT INTO t VALUES ('1','a')");
    const r = reconcileSqlRow(
      db,
      baseReq({ table: "nonexistent_table" }),
    );
    assert.equal(r.status, "incomplete_verification");
    assert.equal(r.reasons[0]?.code, "CONNECTOR_ERROR");
    db.close();
  });
});
