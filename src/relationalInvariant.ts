import type { DatabaseSync } from "node:sqlite";
import { formatOperationalMessage } from "./failureCatalog.js";
import { compareUtf16Id } from "./resolveExpectation.js";
import type { ResolvedRelationalCheck } from "./types.js";
import { MAX_VERIFICATION_SAMPLE_ROWS } from "./reconciler.js";
import { SQL_VERIFICATION_OUTCOME_CODE } from "./wireReasonCodes.js";
import type { ReconcileOutput } from "./reconciler.js";

function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/** Exported for tests: EXISTS SQL shape for `related_exists` (single-column match). */
export function buildRelatedExistsSql(
  dialect: "sqlite" | "postgres",
  childTable: string,
  fkColumn: string,
): { text: string } {
  const { text } = buildRelationalScalarSql(dialect, {
    checkKind: "related_exists",
    id: "_",
    childTable,
    matchEq: [{ column: fkColumn, value: "_" }],
  });
  return { text };
}

function nextPlaceholder(dialect: "sqlite" | "postgres", p: { n: number }): string {
  return dialect === "postgres" ? `$${p.n++}` : "?";
}

export function buildRelationalScalarSql(
  dialect: "sqlite" | "postgres",
  check: ResolvedRelationalCheck,
): { text: string; values: string[] } {
  if (check.checkKind === "related_exists") {
    const t = quoteIdent(check.childTable);
    const conds: string[] = [];
    const values: string[] = [];
    const p = { n: 1 };
    for (const w of check.matchEq) {
      conds.push(`${t}.${quoteIdent(w.column)} = ${nextPlaceholder(dialect, p)}`);
      values.push(w.value);
    }
    const text = `SELECT EXISTS (SELECT 1 FROM ${t} WHERE ${conds.join(" AND ")} LIMIT 1) AS v`;
    return { text, values };
  }

  if (check.checkKind === "anti_join") {
    const at = quoteIdent(check.anchorTable);
    const lt = quoteIdent(check.lookupTable);
    const condsOn: string[] = [];
    const values: string[] = [];
    const p = { n: 1 };
    condsOn.push(`A.${quoteIdent(check.anchorColumn)} = L.${quoteIdent(check.lookupColumn)}`);
    for (const w of check.filterEqLookup) {
      condsOn.push(`L.${quoteIdent(w.column)} = ${nextPlaceholder(dialect, p)}`);
      values.push(w.value);
    }
    const whereParts: string[] = [`L.${quoteIdent(check.lookupPresenceColumn)} IS NULL`];
    for (const w of check.filterEqAnchor) {
      whereParts.push(`A.${quoteIdent(w.column)} = ${nextPlaceholder(dialect, p)}`);
      values.push(w.value);
    }
    const text = `SELECT COUNT(*) AS v FROM ${at} AS A LEFT JOIN ${lt} AS L ON ${condsOn.join(" AND ")} WHERE ${whereParts.join(" AND ")}`;
    return { text, values };
  }

  if (check.checkKind === "aggregate") {
    const tbl = quoteIdent(check.table);
    let selectPart: string;
    if (check.fn === "COUNT_STAR") {
      selectPart = `SELECT COUNT(*) AS v FROM ${tbl}`;
    } else {
      const col = check.sumColumn;
      if (!col) {
        throw new Error("SUM requires sumColumn");
      }
      selectPart = `SELECT COALESCE(SUM(${quoteIdent(col)}), 0) AS v FROM ${tbl}`;
    }
    if (check.whereEq.length === 0) {
      return { text: selectPart, values: [] };
    }
    const conds = check.whereEq.map((w, i) => {
      const ph = dialect === "postgres" ? `$${i + 1}` : "?";
      return `${tbl}.${quoteIdent(w.column)} = ${ph}`;
    });
    return {
      text: `${selectPart} WHERE ${conds.join(" AND ")}`,
      values: check.whereEq.map((w) => w.value),
    };
  }

  if (check.checkKind === "join_count") {
    const lt = quoteIdent(check.leftTable);
    const rt = quoteIdent(check.rightTable);
    const base =
      `SELECT COUNT(*) AS v FROM ${lt} AS L INNER JOIN ${rt} AS R ON L.${quoteIdent(check.leftJoinColumn)} = R.${quoteIdent(check.rightJoinColumn)}`;
    if (check.whereEq.length === 0) {
      return { text: base, values: [] };
    }
    const conds = check.whereEq.map((w, i) => {
      const ph = dialect === "postgres" ? `$${i + 1}` : "?";
      const alias = w.side === "left" ? "L" : "R";
      return `${alias}.${quoteIdent(w.column)} = ${ph}`;
    });
    return {
      text: `${base} WHERE ${conds.join(" AND ")}`,
      values: check.whereEq.map((w) => w.value),
    };
  }

  const _exhaustive: never = check;
  return _exhaustive;
}

/** Sample SELECT for anti_join failures (anchor columns only). */
export function buildAntiJoinSampleSql(
  dialect: "sqlite" | "postgres",
  check: ResolvedRelationalCheck & { checkKind: "anti_join" },
): { text: string; values: string[] } {
  const at = quoteIdent(check.anchorTable);
  const lt = quoteIdent(check.lookupTable);
  const condsOn: string[] = [];
  const values: string[] = [];
  const p = { n: 1 };
  condsOn.push(`A.${quoteIdent(check.anchorColumn)} = L.${quoteIdent(check.lookupColumn)}`);
  for (const w of check.filterEqLookup) {
    condsOn.push(`L.${quoteIdent(w.column)} = ${nextPlaceholder(dialect, p)}`);
    values.push(w.value);
  }
  const whereParts: string[] = [`L.${quoteIdent(check.lookupPresenceColumn)} IS NULL`];
  for (const w of check.filterEqAnchor) {
    whereParts.push(`A.${quoteIdent(w.column)} = ${nextPlaceholder(dialect, p)}`);
    values.push(w.value);
  }
  const anchorColSet = new Set<string>([check.anchorColumn]);
  for (const w of check.filterEqAnchor) anchorColSet.add(w.column);
  const proj = [...anchorColSet].sort((a, b) => compareUtf16Id(a, b));
  const selectList = proj.map((c) => `A.${quoteIdent(c)}`).join(", ");
  const text = `SELECT ${selectList} FROM ${at} AS A LEFT JOIN ${lt} AS L ON ${condsOn.join(" AND ")} WHERE ${whereParts.join(" AND ")} LIMIT ${MAX_VERIFICATION_SAMPLE_ROWS}`;
  return { text, values };
}

function normalizeNumericActual(raw: unknown, ctx: string): { ok: true; n: number } | { ok: false } {
  if (raw === null || raw === undefined) {
    return { ok: false };
  }
  if (typeof raw === "boolean") {
    return { ok: true, n: raw ? 1 : 0 };
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { ok: true, n: raw };
  }
  if (typeof raw === "bigint") {
    if (raw >= BigInt(Number.MIN_SAFE_INTEGER) && raw <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return { ok: true, n: Number(raw) };
    }
    return { ok: false };
  }
  return { ok: false };
}

function compareExpect(actual: number, op: "eq" | "gte" | "lte", expected: number): boolean {
  if (op === "eq") return actual === expected;
  if (op === "gte") return actual >= expected;
  return actual <= expected;
}

export function reconcileRelationalRow(
  row: Record<string, unknown> | undefined,
  check: ResolvedRelationalCheck,
): ReconcileOutput {
  const id = check.id;
  if (row === undefined) {
    return {
      status: "incomplete_verification",
      reasons: [
        {
          code: SQL_VERIFICATION_OUTCOME_CODE.RELATIONAL_SCALAR_UNUSABLE,
          message: formatOperationalMessage(`Relational check ${id}: no result row`),
        },
      ],
      evidenceSummary: { checkId: id, checkKind: check.checkKind },
    };
  }

  const vRaw = row.v ?? row.V;
  if (check.checkKind === "related_exists") {
    const norm = normalizeNumericActual(vRaw, id);
    if (!norm.ok || (norm.n !== 0 && norm.n !== 1)) {
      return {
        status: "incomplete_verification",
        reasons: [
          {
            code: SQL_VERIFICATION_OUTCOME_CODE.RELATIONAL_SCALAR_UNUSABLE,
            message: formatOperationalMessage(`Relational check ${id}: EXISTS result not boolean/0/1`),
          },
        ],
        evidenceSummary: { checkId: id, checkKind: check.checkKind, raw: vRaw },
      };
    }
    if (norm.n === 1) {
      return { status: "verified", reasons: [], evidenceSummary: { checkId: id, checkKind: check.checkKind, v: 1 } };
    }
    return {
      status: "missing",
      reasons: [
        {
          code: SQL_VERIFICATION_OUTCOME_CODE.RELATED_ROWS_ABSENT,
          message: formatOperationalMessage(`Relational check ${id}: related row does not exist`),
        },
      ],
      evidenceSummary: { checkId: id, checkKind: check.checkKind, v: 0 },
    };
  }

  if (check.checkKind === "anti_join") {
    const norm = normalizeNumericActual(vRaw, id);
    if (!norm.ok) {
      return {
        status: "incomplete_verification",
        reasons: [
          {
            code: SQL_VERIFICATION_OUTCOME_CODE.RELATIONAL_SCALAR_UNUSABLE,
            message: formatOperationalMessage(`Relational check ${id}: non-numeric anti_join count`),
          },
        ],
        evidenceSummary: { checkId: id, checkKind: check.checkKind, raw: vRaw },
      };
    }
    if (norm.n === 0) {
      return {
        status: "verified",
        reasons: [],
        evidenceSummary: { checkId: id, checkKind: check.checkKind, orphanRowCount: 0 },
      };
    }
    return {
      status: "inconsistent",
      reasons: [
        {
          code: SQL_VERIFICATION_OUTCOME_CODE.ORPHAN_ROW_DETECTED,
          message: formatOperationalMessage(`Relational check ${id}: ${norm.n} orphan row(s)`),
        },
      ],
      evidenceSummary: {
        checkId: id,
        checkKind: check.checkKind,
        orphanRowCount: norm.n,
      },
    };
  }

  const norm = normalizeNumericActual(vRaw, id);
  if (!norm.ok) {
    return {
      status: "incomplete_verification",
      reasons: [
        {
          code: SQL_VERIFICATION_OUTCOME_CODE.RELATIONAL_SCALAR_UNUSABLE,
          message: formatOperationalMessage(`Relational check ${id}: non-numeric aggregate result`),
        },
      ],
      evidenceSummary: { checkId: id, checkKind: check.checkKind, raw: vRaw },
    };
  }

  const ok = compareExpect(norm.n, check.expectOp, check.expectValue);
  if (!ok) {
    return {
      status: "inconsistent",
      reasons: [
        {
          code: SQL_VERIFICATION_OUTCOME_CODE.RELATIONAL_EXPECTATION_MISMATCH,
          message: formatOperationalMessage(
            `Relational check ${id}: expected ${check.expectOp} ${check.expectValue} but actual ${norm.n}`,
          ),
        },
      ],
      evidenceSummary: {
        checkId: id,
        checkKind: check.checkKind,
        actual: norm.n,
        expected: check.expectValue,
        op: check.expectOp,
      },
    };
  }

  return {
    status: "verified",
    reasons: [],
    evidenceSummary: {
      checkId: id,
      checkKind: check.checkKind,
      actual: norm.n,
      expected: check.expectValue,
      op: check.expectOp,
    },
  };
}

function mergeAntiJoinSamples(base: ReconcileOutput, sampleRows: Record<string, unknown>[]): ReconcileOutput {
  return {
    ...base,
    evidenceSummary: {
      ...base.evidenceSummary,
      sampleRows,
    },
  };
}

export function reconcileRelationalSqlite(db: DatabaseSync, check: ResolvedRelationalCheck): ReconcileOutput {
  const { text, values } = buildRelationalScalarSql("sqlite", check);
  try {
    const stmt = db.prepare(text);
    const row = stmt.get(...values) as Record<string, unknown> | undefined;
    const lowered =
      row === undefined
        ? undefined
        : Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
    let out = reconcileRelationalRow(lowered, check);
    if (
      check.checkKind === "anti_join" &&
      out.status === "inconsistent" &&
      out.reasons[0]?.code === SQL_VERIFICATION_OUTCOME_CODE.ORPHAN_ROW_DETECTED
    ) {
      const { text: st, values: sv } = buildAntiJoinSampleSql("sqlite", check);
      const sampleStmt = db.prepare(st);
      const sampleRaw = sampleStmt.all(...sv) as Record<string, unknown>[];
      const sampleRows = sampleRaw.map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v])),
      );
      out = mergeAntiJoinSamples(out, sampleRows);
    }
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: "incomplete_verification",
      reasons: [
        {
          code: SQL_VERIFICATION_OUTCOME_CODE.CONNECTOR_ERROR,
          message: formatOperationalMessage(msg),
        },
      ],
      evidenceSummary: { checkId: check.id, checkKind: check.checkKind, error: true },
    };
  }
}

type PgClientLike = { query: (text: string, values: string[]) => Promise<{ rows: Record<string, unknown>[] }> };

export async function reconcileRelationalPostgres(
  client: PgClientLike,
  check: ResolvedRelationalCheck,
): Promise<ReconcileOutput> {
  const { text, values } = buildRelationalScalarSql("postgres", check);
  try {
    const r = await client.query(text, values);
    const row0 = r.rows[0];
    const lowered =
      row0 === undefined
        ? undefined
        : Object.fromEntries(Object.entries(row0).map(([k, v]) => [k.toLowerCase(), v]));
    let out = reconcileRelationalRow(lowered, check);
    if (
      check.checkKind === "anti_join" &&
      out.status === "inconsistent" &&
      out.reasons[0]?.code === SQL_VERIFICATION_OUTCOME_CODE.ORPHAN_ROW_DETECTED
    ) {
      const { text: st, values: sv } = buildAntiJoinSampleSql("postgres", check);
      const sr = await client.query(st, sv);
      const sampleRows = sr.rows.map((row) =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])),
      );
      out = mergeAntiJoinSamples(out, sampleRows);
    }
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: "incomplete_verification",
      reasons: [
        {
          code: SQL_VERIFICATION_OUTCOME_CODE.CONNECTOR_ERROR,
          message: formatOperationalMessage(msg),
        },
      ],
      evidenceSummary: { checkId: check.id, checkKind: check.checkKind, error: true },
    };
  }
}
