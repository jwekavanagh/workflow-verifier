import type { DatabaseSync } from "node:sqlite";
import type pg from "pg";
import { fetchRowsForVerification } from "../sqlConnector.js";
import { buildSelectByIdentitySqlPostgres } from "../sqlReadBackend.js";
import { reconcileFromRows } from "../reconciler.js";
import { buildRelationalScalarSql } from "../relationalInvariant.js";
import { ConnectorError } from "../sqlConnector.js";
import type { ResolvedRelationalCheck, VerificationRequest } from "../types.js";

export type RowVerifyOutcome = {
  verdict: "verified" | "fail" | "uncertain";
  reasonCodes: string[];
  verification: Record<string, unknown>;
  explanation: string;
};

export function verifyRowSqlite(db: DatabaseSync, req: VerificationRequest): RowVerifyOutcome {
  try {
    const rows = fetchRowsForVerification(db, req);
    const out = reconcileFromRows(rows, req);
    if (out.status === "verified") {
      return {
        verdict: "verified",
        reasonCodes: [],
        verification: { rowCount: rows.length, evidenceSummary: out.evidenceSummary },
        explanation: "Row matched identity and required fields.",
      };
    }
    const codes = out.reasons.map((r) => r.code);
    const expl = out.reasons.map((r) => r.message).join("; ");
    return {
      verdict: out.status === "missing" || out.status === "inconsistent" ? "fail" : "uncertain",
      reasonCodes: codes,
      verification: { evidenceSummary: out.evidenceSummary },
      explanation: expl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      verdict: "uncertain",
      reasonCodes: ["CONNECTOR_ERROR"],
      verification: {},
      explanation: msg,
    };
  }
}

export async function verifyRowPostgres(client: pg.Client, req: VerificationRequest): Promise<RowVerifyOutcome> {
  try {
    const { text, values } = buildSelectByIdentitySqlPostgres(req);
    const r = await client.query(text, values);
    const rows = r.rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])),
    );
    const out = reconcileFromRows(rows, req);
    if (out.status === "verified") {
      return {
        verdict: "verified",
        reasonCodes: [],
        verification: { rowCount: rows.length, evidenceSummary: out.evidenceSummary },
        explanation: "Row matched identity and required fields.",
      };
    }
    const codes = out.reasons.map((r) => r.code);
    return {
      verdict: out.status === "missing" || out.status === "inconsistent" ? "fail" : "uncertain",
      reasonCodes: codes,
      verification: { evidenceSummary: out.evidenceSummary },
      explanation: out.reasons.map((x) => x.message).join("; "),
    };
  } catch (e) {
    const msg = e instanceof ConnectorError ? e.message : e instanceof Error ? e.message : String(e);
    return {
      verdict: "uncertain",
      reasonCodes: ["CONNECTOR_ERROR"],
      verification: {},
      explanation: msg,
    };
  }
}

export async function verifyRelatedExists(
  dialect: "postgres" | "sqlite",
  clientOrDb: pg.Client | DatabaseSync,
  check: ResolvedRelationalCheck & { checkKind: "related_exists" },
): Promise<RowVerifyOutcome> {
  const { text, values } = buildRelationalScalarSql(dialect, check);
  try {
    if (dialect === "postgres") {
      const client = clientOrDb as pg.Client;
      const r = await client.query(text, values);
      const row = r.rows[0] as Record<string, unknown> | undefined;
      const v = row?.v ?? row?.V;
      const ok = normalizeExistsScalar(v);
      if (!ok.ok) {
        return {
          verdict: "uncertain",
          reasonCodes: ["RELATIONAL_SCALAR_UNUSABLE"],
          verification: {},
          explanation: "EXISTS scalar unusable",
        };
      }
      if (ok.val === 1) {
        return {
          verdict: "verified",
          reasonCodes: [],
          verification: {},
          explanation: "Related row exists.",
        };
      }
      return {
        verdict: "fail",
        reasonCodes: ["RELATED_ROWS_ABSENT"],
        verification: {},
        explanation: "No matching related row.",
      };
    }
    const db = clientOrDb as DatabaseSync;
    const stmt = db.prepare(text);
    const row = stmt.get(...values) as Record<string, unknown> | undefined;
    const v = row?.v ?? row?.V;
    const ok = normalizeExistsScalar(v);
    if (!ok.ok) {
      return {
        verdict: "uncertain",
        reasonCodes: ["RELATIONAL_SCALAR_UNUSABLE"],
        verification: {},
        explanation: "EXISTS scalar unusable",
      };
    }
    if (ok.val === 1) {
      return {
        verdict: "verified",
        reasonCodes: [],
        verification: {},
        explanation: "Related row exists.",
      };
    }
    return {
      verdict: "fail",
      reasonCodes: ["RELATED_ROWS_ABSENT"],
      verification: {},
      explanation: "No matching related row.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      verdict: "uncertain",
      reasonCodes: ["CONNECTOR_ERROR"],
      verification: {},
      explanation: msg,
    };
  }
}

function normalizeExistsScalar(raw: unknown): { ok: true; val: 0 | 1 } | { ok: false } {
  if (raw === true || raw === 1) return { ok: true, val: 1 };
  if (raw === false || raw === 0) return { ok: true, val: 0 };
  if (typeof raw === "string") {
    const l = raw.toLowerCase();
    if (l === "t" || l === "true" || l === "1") return { ok: true, val: 1 };
    if (l === "f" || l === "false" || l === "0") return { ok: true, val: 0 };
  }
  return { ok: false };
}
