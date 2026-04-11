import { describe, expect, it } from "vitest";
import {
  ensureDatabaseUrlForNodePgDriver,
  ensureSslModeRequire,
} from "@/db/ensureSslModeRequire";

describe("ensureSslModeRequire", () => {
  it("leaves localhost URLs unchanged", () => {
    const u = "postgresql://postgres:postgres@127.0.0.1:5433/wfv";
    expect(ensureSslModeRequire(u)).toBe(u);
  });

  it("appends sslmode=require for remote Supabase-style hosts", () => {
    const u = "postgresql://user:pass@db.abcdefgh.supabase.co:5432/postgres";
    expect(ensureSslModeRequire(u)).toBe(
      "postgresql://user:pass@db.abcdefgh.supabase.co:5432/postgres?sslmode=require",
    );
  });

  it("merges with existing query string", () => {
    const u = "postgresql://user:pass@db.example.com:5432/postgres?connect_timeout=10";
    expect(ensureSslModeRequire(u)).toBe(
      "postgresql://user:pass@db.example.com:5432/postgres?connect_timeout=10&sslmode=require",
    );
  });

  it("replaces non-require sslmode values", () => {
    const u = "postgresql://u:p@db.example.com:5432/postgres?sslmode=verify-full";
    expect(ensureSslModeRequire(u)).toBe(
      "postgresql://u:p@db.example.com:5432/postgres?sslmode=require",
    );
  });

  it("does not duplicate sslmode=require", () => {
    const u = "postgresql://u:p@db.example.com:5432/postgres?sslmode=require";
    expect(ensureSslModeRequire(u)).toBe(u);
  });

  it("passes through non-postgres URLs", () => {
    expect(ensureSslModeRequire("mysql://x")).toBe("mysql://x");
  });
});

describe("ensureDatabaseUrlForNodePgDriver (drizzle-kit / node-pg)", () => {
  it("leaves localhost unchanged", () => {
    const u = "postgresql://postgres:postgres@127.0.0.1:5433/wfv";
    expect(ensureDatabaseUrlForNodePgDriver(u)).toBe(u);
  });

  it("appends sslmode=require and uselibpqcompat=true for remote hosts", () => {
    const u = "postgresql://user:pass@db.abcdefgh.supabase.co:5432/postgres";
    expect(ensureDatabaseUrlForNodePgDriver(u)).toBe(
      "postgresql://user:pass@db.abcdefgh.supabase.co:5432/postgres?sslmode=require&uselibpqcompat=true",
    );
  });

  it("adds uselibpqcompat when sslmode=require already present", () => {
    const u = "postgresql://u:p@db.example.com:5432/postgres?sslmode=require";
    expect(ensureDatabaseUrlForNodePgDriver(u)).toBe(
      "postgresql://u:p@db.example.com:5432/postgres?sslmode=require&uselibpqcompat=true",
    );
  });

  it("does not duplicate uselibpqcompat", () => {
    const u =
      "postgresql://u:p@db.example.com:5432/postgres?sslmode=require&uselibpqcompat=true";
    expect(ensureDatabaseUrlForNodePgDriver(u)).toBe(u);
  });
});
