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
    keyColumn: "id",
    keyValue: "1",
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
    db.close();
  });

  it("DUPLICATE_ROWS when two matches", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT, name TEXT)");
    db.exec("INSERT INTO t VALUES ('1','a'),('1','b')");
    const r = reconcileSqlRow(db, baseReq());
    assert.equal(r.status, "inconsistent");
    assert.equal(r.reasons[0]?.code, "DUPLICATE_ROWS");
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

  it("NULL_FIELD partial when required column null", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT, status TEXT)");
    db.exec("INSERT INTO t VALUES ('1',NULL,'x')");
    const r = reconcileSqlRow(db, baseReq({ requiredFields: { name: "x", status: "x" } }));
    assert.equal(r.status, "partial");
    assert.equal(r.reasons[0]?.code, "NULL_FIELD");
    db.close();
  });

  it("VALUE_MISMATCH inconsistent", () => {
    const db = memDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)");
    db.exec("INSERT INTO t VALUES ('1','wrong')");
    const r = reconcileSqlRow(db, baseReq({ requiredFields: { name: "a" } }));
    assert.equal(r.status, "inconsistent");
    assert.equal(r.reasons[0]?.code, "VALUE_MISMATCH");
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
      baseReq({ table: "nonexistent_table", keyColumn: "id", keyValue: "1" }),
    );
    assert.equal(r.status, "incomplete_verification");
    assert.equal(r.reasons[0]?.code, "CONNECTOR_ERROR");
    db.close();
  });
});
