# First-run onboarding — wall-clock validation log

## Purpose

This log records executions of the mandatory procedure for the **≤5 minute** first-run acceptance target (`npm install` then `npm run first-run` on a clean tree). Each row is evidence that `seconds_total <= 300` was met for that environment.

## Procedure

1. Use a machine with Node.js and npm satisfying [`package.json`](../package.json) `engines` (currently `>=22.13.0`). Record `platform` (e.g. `win32 10.0.xxx`), `node_version` (`node -v`), `npm_version` (`npm -v`).
2. Clone the repository into a new empty directory (no existing `node_modules` or `dist/`).
3. `cd` into the repo root. Record **start time** `t0` (UTC, second precision).
4. Run `npm install`. Record **end time** `t1`. Define `seconds_npm_install = round(t1 - t0)`.
5. Record **start time** `t2`. Run `npm run first-run`. Record **end time** `t3` when the process exits 0. Define `seconds_npm_run_first_run = round(t3 - t2)`.
6. Define `seconds_total = seconds_npm_install + seconds_npm_run_first_run`. Set `meets_5min_goal` to **`Y`** if `seconds_total <= 300`, else **`N`**.
7. Append one table row to this file with all columns. **Verdict for merge:** `meets_5min_goal` must be **`Y`**.

## Log

| date_utc | platform | node_version | npm_version | seconds_npm_install | seconds_npm_run_first_run | seconds_total | meets_5min_goal |
|----------|----------|--------------|-------------|---------------------|---------------------------|---------------|-----------------|
| 2026-04-03T17:59:28Z | Microsoft Windows NT 10.0.26200.0 | v24.14.0 | 11.9.0 | 4 | 3 | 7 | Y |

**Row 1 execution note:** Step 2 used a clean filesystem copy of the repository root into `%TEMP%\etl-nod-first-run-val` with `node_modules` and `dist` excluded (equivalent to a fresh tree for timing). Steps 3–7 were executed as written. Substituting `git clone` avoids measuring a clone that would omit uncommitted onboarding changes.
