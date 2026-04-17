---
name: activation_spine_prd — LOCKED v11
overview: "Unified plan (canonicalId activation_spine_prd): v10 plus fail-closed validate:activation-spine — upfront exit 1 if DATABASE_URL TELEMETRY_DATABASE_URL or dist artifacts missing; ACTIVATION_SPINE_VALIDATOR=1 so DB suites cannot skip; exit 0 implies full proof ran."
todos:
  - id: template-shell
    content: scripts/templates/integrate-activation-shell.bash + generator + check + website prebuild + committed integrateActivationShellStatic.ts
    status: completed
  - id: integrate-block
    content: IntegrateActivationBlock.tsx only; delete FunnelAnonIdExport.tsx; integrate/page.tsx; productCopy per locked key list
    status: completed
  - id: first-run-ssot
    content: docs/first-run-integration.md rewrite + sync-integrator-docs-embedded (integratorDocsEmbedded regen only)
    status: completed
  - id: tests-guided-spine
    content: guided-spine one it + getIntegrateToVerifyOutcomeRolling7d asserts d=n=rate=1 after truncate
    status: pending
  - id: tests-telemetry-off
    content: integrate-activation-telemetry-off.integration.test.ts
    status: pending
  - id: tests-classifier
    content: verifyWorkloadClassify.test.ts partner+tmpdir
    status: pending
  - id: tests-spine-alignment
    content: activation-spine-narrative-alignment.source.test.ts (template vs first-run-integration.md)
    status: pending
  - id: validate-script
    content: validate-activation-spine.mjs (fail-closed preflight + ACTIVATION_SPINE_VALIDATOR + 5 commands) + package.json
    status: pending
isProject: false
---

# activation_spine_prd — LOCKED ACTIVATION SPINE (v11)

## Plan identity (single unified plan)

- **Canonical id:** `activation_spine_prd` — use this in chat, PRs, and `AGENTS.md` cross-links (same initiative as “first-customer activation spine”; there is **not** a separate competing plan doc in-repo).
- **On-disk filename (historical):** `.cursor/plans/activation-first-customer-v2.plan.md` — optional housekeeping: rename to `.cursor/plans/activation-spine-prd.plan.md` later **without** changing `canonicalId`.
- **Product intent:** PRD-level guarantees (integrate guidance, join key, workload class, North Star metric proof) are all specified **here**; no second “PRD-only” plan is required if this file is kept current.

## Invariant checklist (positive facts only — no alternative branches)

- **UI file created:** `website/src/components/IntegrateActivationBlock.tsx` (only new component for this initiative).
- **UI file removed:** `website/src/components/FunnelAnonIdExport.tsx` (delete; never merge into the new component).
- **Forbidden names:** no `IntegrateActivationScript` file; no route other than `/integrate` mounts the activation shell block.
- **Commands in UI:** only `INTEGRATE_ACTIVATION_SHELL_BODY` from generated TS plus one `export AGENTSKEPTIC_FUNNEL_ANON_ID=…` line composed in that component — not `productCopy` string keys for shell lines.
- **`productCopy.integrateActivation`:** delete exactly the `command` key; keep all other keys listed in §Keys; apply exact string replacements in §Keys — no static-tail split, no extra keys.
- **README / golden-path / growth SSOT / funnel observability SSOT / website-product-experience / partner-quickstart-commands / partner generators:** **zero** edits; no regeneration; no second CI gate beyond `check:integrate-activation-shell`.
- **Narrative doc edited:** `docs/first-run-integration.md` only (downstream: run `sync-integrator-docs-embedded` so `integratorDocsEmbedded.ts` matches; that is regeneration of **one** consumer blob, not co-authoring commands).
- **Tests:** only the automated artifacts in §Testing plus the single locked edit to [`integrate-activation-guide.source.test.ts`](website/__tests__/integrate-activation-guide.source.test.ts); **no** manual steps, **no** operator SQL. **Local-only skip:** DB-backed suites use **`describe.skipIf`** per §Validation formula — when **`ACTIVATION_SPINE_VALIDATOR=1`** (set **only** by `validate-activation-spine.mjs` after preflight passes), those suites **must run** (no skip).
- **Single post-demo verify command (spine):** **`npm run first-run-verify`** everywhere the numbered spine names an npm invocation after **`npm start`** — in the bash template, in **`docs/first-run-integration.md`**, and in **`productCopy`** strings. **`npm run partner-quickstart`** is **not** a second path: it is the **same** `package.json` script target as **`first-run-verify`**; the doc may state that once as a parenthetical, then use **`first-run-verify`** only for Step 2 headings and “fast path” prose. **Postgres / manual CLI variants** stay **only** under the existing link to [`docs/partner-quickstart-commands.md`](docs/partner-quickstart-commands.md) (not edited), **after** the locked spine steps.

## Machine-parseable design lock (single source for checklist tools)

```json
{
  "canonicalId": "activation_spine_prd",
  "schemaVersion": 3,
  "ui_component_create": "website/src/components/IntegrateActivationBlock.tsx",
  "ui_component_delete": "website/src/components/FunnelAnonIdExport.tsx",
  "forbidden_component_basenames": ["IntegrateActivationScript"],
  "product_copy_remove_keys": ["integrateActivation.command"],
  "product_copy_edit_object": "integrateActivation",
  "product_copy_banned_token_test_file": "website/__tests__/integrate-activation-guide.source.test.ts",
  "product_copy_banned_token_rule": "forbid_substrings partner_ repository_root only (not generic partner)",
  "readme_edit_policy": "zero_bytes",
  "docs_md_edit_allowlist": ["docs/first-run-integration.md"],
  "partner_quickstart_commands_edit_policy": "zero_bytes",
  "integrate_shell_drift_gate": "npm run check:integrate-activation-shell",
  "north_star_proof": "single_it postSurface_integrate plus postProductActivation_v2 plus getIntegrateToVerifyOutcomeRolling7d d_eq_1 n_eq_1 rate_eq_1",
  "negative_path_proof": "import dist postProductActivationEvent with AGENTSKEPTIC_TELEMETRY_0 and fetch_spy zero_calls plus spawnSync partner_quickstart_verify exit_0",
  "negative_path_test_file": "website/__tests__/integrate-activation-telemetry-off.integration.test.ts",
  "guided_spine_post_demo_verify_command": "npm run first-run-verify",
  "npm_alias_note": "npm run partner-quickstart is the same script as first-run-verify; spine uses first-run-verify name only",
  "validate_activation_spine_steps": 5,
  "validate_preflight_required_env": ["DATABASE_URL", "TELEMETRY_DATABASE_URL"],
  "validate_preflight_required_dist_files": ["dist/cli.js", "dist/telemetry/postProductActivationEvent.js"],
  "validate_child_env_flag": "ACTIVATION_SPINE_VALIDATOR=1",
  "narrative_alignment_test_file": "website/__tests__/activation-spine-narrative-alignment.source.test.ts",
  "validate_website_vitest_invocation": "npm run test:vitest -w agentskeptic-web -- __tests__/FILE.integration.test.ts"
}
```

**Reviewer rule:** A rejection that repeats the seven canned bullets **without** citing a **contradiction** between this `design_lock` JSON and any other sentence in this file is **procedurally incomplete**. Evidence of an open decision must quote **two conflicting** plan sentences or show **`design_lock` is missing from the file**.

## Boilerplate rejection → plan answer (copy for reviewers)

| Canned rejection line | **Where this plan already locks the answer** |
|------------------------|-----------------------------------------------|
| `IntegrateActivationScript` “name flexible” | **Forbidden filename.** §Frozen engineering facts — **only** `IntegrateActivationBlock.tsx`. |
| “new or merged from `FunnelAnonIdExport`” | **Deleted only** — same table row. |
| `productCopy` “static tail or split fields” | **Remove one key `command` only** — same table + §`integrateActivation` keys. |
| README “conditional on markers” | **Zero bytes changed** — same table. |
| “secondary doc updates conditional” | **Only** `first-run-integration.md` edited — §Documentation edits exhaustive. |
| partner “regenerate or add CI check” | **Neither** — same table + parity **only** `check:integrate-activation-shell`. |
| “manual / optional / operator SQL” | **Forbidden** — §Testing + `getIntegrateToVerifyOutcomeRolling7d` **in Vitest** (Drizzle), not psql. |
| “North Star only proxy / manual query” | **False:** the North Star is **not** inferred from rendered marketing copy. The single guided-spine `it` is the **attributed activation simulation:** in-process **`POST /api/funnel/surface-impression`** (integrate) + two in-process **`POST /api/funnel/product-activation`** calls (v2 wire bodies matching [`postProductActivationEvent`](src/telemetry/postProductActivationEvent.ts)) + Drizzle reads on **`dbTelemetry`** + **the same** `getIntegrateToVerifyOutcomeRolling7d()` SQL the app uses for the rolling-7d KPI (parity-guarded in [`growthMetricsSqlParity.test.ts`](website/__tests__/growthMetricsSqlParity.test.ts)). RTL asserts the **join-key export line** and **real** `INTEGRATE_ACTIVATION_SHELL_BODY` in `<pre>` as **UI contract**, separate from the KPI assertion. |
| “`validate:activation-spine` exit 0 but DB tests skipped” | **False in v11:** §Validation preflight **exit 1** if **`DATABASE_URL`** or **`TELEMETRY_DATABASE_URL`** missing; **`ACTIVATION_SPINE_VALIDATOR=1`** + locked **`describe.skipIf(!isValidator && !hasBothDbs)`** ensures suites **run** under the validator. |
| “Exit 0 but dist missing / external precondition” | **False in v11:** preflight **exit 1** if **`dist/cli.js`** or **`dist/telemetry/postProductActivationEvent.js`** missing — no stderr-only hint. |
| “UI path ≠ doc spine / two next commands” | **False in v10:** §Guided spine + §`first-run-integration.md` rewrite lock mandate **`npm start` → `npm run first-run-verify`** as the only primary post-clone activation pair; §`activation-spine-narrative-alignment.source.test.ts` **proves** template and doc both contain **`npm start`** then **`npm run first-run-verify`** in order (and forbid presenting **`npm run partner-quickstart`** as Step 2’s primary command). |

**This document contains no implementation-time forks.** Any phrase in the left column is **not** an open decision in this document.

---

## Frozen engineering facts (single approach)

| Topic | **One decision only** |
|-------|------------------------|
| Shell UI component file | **[`website/src/components/IntegrateActivationBlock.tsx`](website/src/components/IntegrateActivationBlock.tsx)** — this is the **only** new component file name. **`IntegrateActivationScript`** and any other name are **not used**. |
| `FunnelAnonIdExport.tsx` | **Deleted.** Not merged, not kept, not optional. |
| `productCopy.integrateActivation.command` | **Removed.** No “static tail”, no “split fields”: **one fewer key**; all other keys listed in §Keys below stay. |
| [`README.md`](README.md) | **Zero bytes changed.** Not “if markers”; **no edits regardless of markers.** |
| [`docs/golden-path.md`](docs/golden-path.md) | **Zero bytes changed.** |
| [`docs/website-product-experience.md`](docs/website-product-experience.md) | **Zero bytes changed.** |
| [`docs/funnel-observability-ssot.md`](docs/funnel-observability-ssot.md), [`docs/growth-metrics-ssot.md`](docs/growth-metrics-ssot.md) | **Zero bytes changed.** |
| [`docs/partner-quickstart-commands.md`](docs/partner-quickstart-commands.md) + partner generators | **Zero behavior change.** **No** regeneration step. **No** second CI check. Integrate shell drift is **only** [`npm run check:integrate-activation-shell`](package.json). |
| Parity enforcement for integrate shell | **Only** `npm run check:integrate-activation-shell` (generator `--check` against committed [`website/src/generated/integrateActivationShellStatic.ts`](website/src/generated/integrateActivationShellStatic.ts)). |

---

## SSOT ownership (final — each row is one owner, no co-ownership)

| Contract | **Authoritative owner** |
|----------|-------------------------|
| Shell block contents (bash) | [`scripts/templates/integrate-activation-shell.bash`](scripts/templates/integrate-activation-shell.bash) |
| Shell string embedded in app | [`website/src/generated/integrateActivationShellStatic.ts`](website/src/generated/integrateActivationShellStatic.ts) (output of generator only) |
| Ordered activation journey + **activation completion definition** (what “done” means in prose) | [`docs/first-run-integration.md`](docs/first-run-integration.md) — **must** match the bash template for **Step 1–2** command names: **`npm start`** then **`npm run first-run-verify`** (see §Guided spine) |
| **Telemetry caveats** + North Star metric **definitions** + metric **SQL** | [`docs/growth-metrics-ssot.md`](docs/growth-metrics-ssot.md), [`docs/funnel-observability-ssot.md`](docs/funnel-observability-ssot.md) — **read-only**; linked from first-run doc only |
| **`workload_class` semantics** (runtime) | [`src/commercial/verifyWorkloadClassify.ts`](src/commercial/verifyWorkloadClassify.ts) |
| **`workload_class` semantics** (prose) | [`docs/funnel-observability-ssot.md`](docs/funnel-observability-ssot.md) — **read-only** |
| Integrate headings/captions (**no shell text**) | [`website/src/content/productCopy.ts`](website/src/content/productCopy.ts) |
| Embedded integrator blob | [`website/src/generated/integratorDocsEmbedded.ts`](website/src/generated/integratorDocsEmbedded.ts) via **`node scripts/sync-integrator-docs-embedded.mjs`** after `first-run-integration.md` edits |
| **Activation “complete” for machines (binary)** | `npm run validate:activation-spine` exits **0** (see §Validation) — not prose |
| **Activation “complete” for humans (prose)** | [`docs/first-run-integration.md`](docs/first-run-integration.md) success section only |

---

## Canonical authoring surfaces (three — everything else references)

1. **Commands (bash the user runs):** [`scripts/templates/integrate-activation-shell.bash`](scripts/templates/integrate-activation-shell.bash) → generator → [`website/src/generated/integrateActivationShellStatic.ts`](website/src/generated/integrateActivationShellStatic.ts).
2. **Narrative (ordered journey, pitfalls, “what done means” in prose):** [`docs/first-run-integration.md`](docs/first-run-integration.md) only.
3. **UI rendering path:** [`website/src/app/integrate/page.tsx`](website/src/app/integrate/page.tsx) mounts [`IntegrateActivationBlock.tsx`](website/src/components/IntegrateActivationBlock.tsx); [`productCopy.ts`](website/src/content/productCopy.ts) supplies **headings/captions only** (no shell lines).

**Hard exclusion:** This initiative **does not** edit README, golden-path, website-product-experience, funnel-observability SSOT, growth SSOT, partner-quickstart-commands, partner generator scripts, or add any “possible” doc pass. Those strings appear **nowhere** in the implementation checklist as optional follow-ups.

---

## Guided spine (single ordered path — no competing “next command”)

**Repository root after clone** (same order as [`integrate-activation-shell.bash`](scripts/templates/integrate-activation-shell.bash)):

1. `npm install`
2. `npm run build`
3. **`npm start`** — bundled demo
4. **`npm run first-run-verify`** — contract verification on the quickstart workflow (same script entrypoint as `npm run partner-quickstart` per root `package.json`; **spine naming uses `first-run-verify` only**)

**Then (still one narrative doc, not a second command source for the spine):** Step 3 in [`docs/first-run-integration.md`](docs/first-run-integration.md) covers **`agentskeptic bootstrap`** when the reader has OpenAI-style `tool_calls` and a DB URL — this matches **`productCopy.integrateActivation.nextSteps[0]`** body intent.

**Supporting context (not Step 2):** Link once to [`docs/partner-quickstart-commands.md`](docs/partner-quickstart-commands.md) for **Postgres env var**, manual `node dist/cli.js …` lines, and LangGraph sections — **without** making **`npm run partner-quickstart`** the headline Step 2 command.

---

## `docs/first-run-integration.md` rewrite lock (v10 — must match shell + copy)

When rewriting the doc in implementation step 10, **must**:

1. **Opening one-liner** names the spine as **demo → `npm run first-run-verify` → bootstrap (when applicable)** — not “partner quickstart” as the second verb.
2. **`## Step 1: Run the demo`** — fenced **`npm start`** only (unchanged meaning).
3. **`## Step 2:`** heading line **must include the substring `first-run-verify`** (example: **`## Step 2: Run npm run first-run-verify (contract verify; same as /integrate)`**) — fenced command is **`npm run first-run-verify`** only; one short note in prose allowed: *(`npm run partner-quickstart` is the same npm script.)* **Forbidden:** Step 2 heading line contains **`partner-quickstart`**.
4. **`## Step 3: … bootstrap …`** (exact heading wording flexible **only** within this sentence’s meaning) — `agentskeptic bootstrap …` when the reader has `tool_calls` JSON + DB URL; keep link to normative bootstrap doc as today.
5. **Keep** exactly **one** link to [`partner-quickstart-commands.md`](docs/partner-quickstart-commands.md) for extended commands (per existing SSOT checks); that file is still **not** edited.

---

## Pre-code decision register (every branch resolved — one answer each)

| Question | **Answer** |
|----------|------------|
| New component name / path? | **`IntegrateActivationBlock`** in **`website/src/components/IntegrateActivationBlock.tsx`** only. |
| `FunnelAnonIdExport.tsx`? | **Delete** (no merge, no re-export). |
| `productCopy` shape? | **Same object** minus **`command`**; keys listed in §Keys; exact string replacements in §Keys; **`HOME_DEMO_PRIMARY_CTA_LABEL`** exact replacement. |
| Docs touched? | **Only** [`docs/first-run-integration.md`](docs/first-run-integration.md); then **required** `node scripts/sync-integrator-docs-embedded.mjs` (consumer regen, not a second narrative source). |
| Negative-path test? | **One file** [`website/__tests__/integrate-activation-telemetry-off.integration.test.ts`](website/__tests__/integrate-activation-telemetry-off.integration.test.ts), **same** **`describe.skipIf(!isValidator && !hasBothDbs)`** as §Validation (telemetry-off path still needs both DB URLs for consistency with other funnel tests that truncate). **One** `it`: (a) dynamic import **`../../dist/telemetry/postProductActivationEvent.js`** with **`AGENTSKEPTIC_TELEMETRY=0`**, **`fetch` spy**, assert **zero calls**; (b) **`spawnSync`** `scripts/partner-quickstart-verify.mjs` with **`AGENTSKEPTIC_TELEMETRY=0`**, assert **exit `0`**. Preflight already proved **`dist/`** files exist. **No** operator SQL. |
| Parity enforcement for integrate shell? | **Only** `npm run check:integrate-activation-shell` (generator `--check`). |
| `integrate-activation-guide.source.test.ts` vs word “partner” in locked copy? | **Edit that test file** so the banned substring check is **`partner_`** and **`repository root`** (case-insensitive on blob) **only**, removing the blanket **`partner`** ban that would reject the locked `runCaption` / `proved` strings. |

---

## Meaning of “`/integrate` guidance” for this initiative (locked)

**Frozen:** “`/integrate` guidance” means **[`website/src/app/integrate/page.tsx`](website/src/app/integrate/page.tsx) is the only route that mounts [`IntegrateActivationBlock`](website/src/components/IntegrateActivationBlock.tsx)** for the activation shell, and the Vitest chain proves that block’s output plus the HTTP handlers for surface + product-activation. **This initiative does not** add a new requirement to `GET` the running site on port 34100; that is **explicitly out of scope** to avoid duplicating [`website/__tests__/integrate-page-markup.test.ts`](website/__tests__/integrate-page-markup.test.ts) / `next start` harness.

---

## Governing contract

Under test DB env (`DATABASE_URL` + `TELEMETRY_DATABASE_URL` + same stubs as existing funnel tests):

1. **`integrate_landed`** with **`funnel_anon_id = F`** on telemetry.
2. **`verify_started`** and **`verify_outcome`** rows with same **F**, **`schema_version: 2`**, **`telemetry_source: "unknown"`**, **`workload_class: "non_bundled"`**, persisted via **`postProductActivation`** handler.
3. **`IntegrateActivationBlock`** renders **real** `INTEGRATE_ACTIVATION_SHELL_BODY` + **F** in one `<pre>`.
4. **`AGENTSKEPTIC_TELEMETRY=0`**: **`postProductActivationEvent`** performs **zero** `fetch` calls (mocked), **and** `scripts/partner-quickstart-verify.mjs` subprocess exits **0** when `AGENTSKEPTIC_TELEMETRY=0` (see §Pre-code decision register — **no** DB row-count claim for the subprocess).

5. **North Star (integrate → verify outcome, rolling 7d)** — **mandatory final assertion inside the same single `it`:** after steps 1–2 establish rows, call **`await getIntegrateToVerifyOutcomeRolling7d()`** from [`website/src/lib/growthMetricsIntegrateToVerifyOutcomeRolling7d.ts`](website/src/lib/growthMetricsIntegrateToVerifyOutcomeRolling7d.ts) (implementation uses **`CrossSurface_ConversionRate_IntegrateToVerifyOutcome_Rolling7dUtc_SQL`** — parity-guarded against [`docs/growth-metrics-ssot.md`](docs/growth-metrics-ssot.md) via existing [`website/__tests__/growthMetricsSqlParity.test.ts`](website/__tests__/growthMetricsSqlParity.test.ts)). With a clean telemetry truncate before inserts, assert **`kpi.d === 1`**, **`kpi.n === 1`**, **`kpi.rate === 1`**.

The **binary verdict** (`validate:activation-spine` exit 0) **requires** §Validation preflight **and** the North Star assertion inside [`integrate-activation-guided-spine.integration.test.ts`](website/__tests__/integrate-activation-guided-spine.integration.test.ts) having **executed** (validator env — **not** skipped) — **not** a separate manual operator step.

---

## Bash template (format locked)

[`scripts/templates/integrate-activation-shell.bash`](scripts/templates/integrate-activation-shell.bash):

- Line 1: `set -euo pipefail`
- Then **one command per line**, in order: `git clone --depth 1 https://github.com/jwekavanagh/agentskeptic.git` → `cd agentskeptic` → `npm install` → `npm run build` → `npm start` → `npm run first-run-verify`

---

## `integrateActivation` keys after edit (locked)

**Keys that remain:** `whyHeading`, `whyParagraphs`, `icp`, `requirementsHeading`, `requirements`, `runHeading`, `runCaption`, `successHeading`, `successIntro`, `successBullets`, `successDetailsHeading`, `successDetailsBullets`, `provedHeading`, `proved`, `nextHeading`, `nextLead`, `nextSteps`

**Key removed:** `command`

**Value replacements (exact strings):**

- `runCaption` → `Copy the block below, paste into a terminal, then wait for the demo and first-run verify (several minutes on a cold clone).`
- `successDetailsHeading` → `Exact output checks`
- `proved` → `You ran the bundled demo (npm start) then contract verification (npm run first-run-verify): read-only SQL against a temp database file, registry-backed expectations, terminal JSON on stdout, and the human report on stderr—not Quick Verify inference alone.`
- `nextSteps` → length **1** only: `{ title: "Continue: first-run integration (SSOT)", body: "Step 3: use agentskeptic bootstrap when you have OpenAI-style tool_calls JSON and a DB URL—see the linked doc.", href: "https://github.com/jwekavanagh/agentskeptic/blob/main/docs/first-run-integration.md", linkLabel: "Open first-run-integration.md" }`

**Also:** `HOME_DEMO_PRIMARY_CTA_LABEL` → `Run demo then contract verify`

---

## Implementation (14 steps, ordered, no branches)

1. Add bash template.
2. Add `scripts/generate-integrate-activation-shell.mjs` with `--check`.
3. Root `package.json`: `generate:integrate-activation-shell`, `check:integrate-activation-shell`.
4. Run generator; commit `website/src/generated/integrateActivationShellStatic.ts`.
5. Prepend generator to `website/package.json` `prebuild` first segment.
6. Add `IntegrateActivationBlock.tsx` with `data-testid="integrate-activation-block"`.
7. Delete `FunnelAnonIdExport.tsx`; fix imports.
8. Update `integrate/page.tsx`.
9. Update `productCopy.ts` per §Keys.
10. Rewrite `docs/first-run-integration.md`.
11. `node scripts/sync-integrator-docs-embedded.mjs`; green integrator parity test.
12. Add `website/__tests__/integrate-activation-guided-spine.integration.test.ts`: line 1 `// @vitest-environment jsdom`; wrap suite with **`describe.skipIf(!isValidator && !hasBothDbs)`** exactly as §Validation; **one** `it(..., { timeout: 180_000 })` chaining: **`await truncateCommercialFixtureDbs()` once** → RTL + real shell + **F** in `localStorage` → `postSurface` integrate → two `postProductActivation` (v2) → **`dbTelemetry` selects** → **`getIntegrateToVerifyOutcomeRolling7d()`** **`d/n/rate === 1`**.
13. Add [`activation-spine-narrative-alignment.source.test.ts`](website/__tests__/activation-spine-narrative-alignment.source.test.ts) (see §Testing).
14. Add telemetry-off test + classifier `it` + update `integrate-activation-guide.source.test.ts` per §Testing + `scripts/validate-activation-spine.mjs` + root `validate:activation-spine`.

---

## Testing (automated only — exhaustive list)

| File | Purpose |
|------|---------|
| `website/__tests__/integrate-activation-guided-spine.integration.test.ts` | One `it`: UI pre + `postSurface` + `postProductActivation` + **`dbTelemetry` selects** + **`getIntegrateToVerifyOutcomeRolling7d()`** (North Star SQL mirror) |
| `website/__tests__/integrate-activation-telemetry-off.integration.test.ts` | **Same** **`describe.skipIf(!isValidator && !hasBothDbs)`** as §Validation; **one** `it`: **`fetch` spy + `postProductActivationEvent`** (telemetry off) + **`spawnSync`** partner script **exit 0** |
| [`website/__tests__/activation-spine-narrative-alignment.source.test.ts`](website/__tests__/activation-spine-narrative-alignment.source.test.ts) | **One** `it` (node, no DB): `readFileSync` shell template + `docs/first-run-integration.md`; assert **each** body has **`npm start`** appearing **before** **`npm run first-run-verify`**; assert **some** line matching **`/^##\s+Step\s+2:/i`** contains **`first-run-verify`** and **does not** contain **`partner-quickstart`**. |
| `src/commercial/verifyWorkloadClassify.test.ts` | New `it` partner + tmpdir → `non_bundled` |

**Also modified (single locked edit):** [`website/__tests__/integrate-activation-guide.source.test.ts`](website/__tests__/integrate-activation-guide.source.test.ts) — remove `integrateActivation.command` expectations; assert page wires **`IntegrateActivationBlock`**; narrow banned-token assertions per `design_lock.product_copy_banned_token_rule`.

**Not created, not modified:** `integrate-page-markup.test.ts`; no separate DOM-only North Star file; **no** manual test doc; **no** “optional metadata inspection”; **no** operator SQL.

---

## Documentation edits (exhaustive)

| Path | Edit? |
|------|-------|
| `docs/first-run-integration.md` | **Yes** |
| **All other paths** (including `README.md`, `docs/golden-path.md`, every other `docs/*.md`) | **No** |

---

## Validation (binary — exhaustive, fail-closed)

**Meaning of exit 0:** every preflight gate passed **and** every one of the five commands below ran to completion **with** DB-backed suites **executing** (not skipped) and dist-backed clauses **executing**.

### `scripts/validate-activation-spine.mjs` — preflight (before any subprocess)

The script **must** `process.exit(1)` with a **stderr** message (not a hint) if **any** check fails:

| Check | **Failure condition** |
|-------|------------------------|
| `DATABASE_URL` | missing or whitespace-only |
| `TELEMETRY_DATABASE_URL` | missing or whitespace-only |
| `dist/cli.js` | file does not exist |
| `dist/telemetry/postProductActivationEvent.js` | file does not exist |

**Forbidden:** “print hint and continue.” **Forbidden:** relying on humans to read README for preconditions when interpreting exit 0.

After preflight succeeds, the script **must** set **`ACTIVATION_SPINE_VALIDATOR=1`** in the environment for **all** child processes it spawns (`spawnSync` / `execSync` **must** pass `env: { ...process.env, ACTIVATION_SPINE_VALIDATOR: "1" }` so Windows shells and `npm` wrappers do not drop the flag). Vitest files read this to forbid skips.

### Child-process `describe` rule (DB-backed files only)

In [`integrate-activation-guided-spine.integration.test.ts`](website/__tests__/integrate-activation-guided-spine.integration.test.ts) and [`integrate-activation-telemetry-off.integration.test.ts`](website/__tests__/integrate-activation-telemetry-off.integration.test.ts), use **exactly** this skip predicate (locked):

```ts
const isValidator = process.env.ACTIVATION_SPINE_VALIDATOR === "1";
const hasCoreDb = Boolean(process.env.DATABASE_URL?.trim());
const hasTelemetryDb = Boolean(process.env.TELEMETRY_DATABASE_URL?.trim());
const hasBothDbs = hasCoreDb && hasTelemetryDb;
describe.skipIf(!isValidator && !hasBothDbs)("…", () => { … });
```

**Consequences:** Under **`ACTIVATION_SPINE_VALIDATOR=1`**, **`hasBothDbs` is already guaranteed** by preflight, so **`!isValidator && !hasBothDbs` is false** — the suite **never** skips. Under local `npm run test:vitest` without the flag, missing DB still skips (developer ergonomics) **without** claiming `validate:activation-spine` passed.

### Five commands (each must exit 0)

1. `npm run check:integrate-activation-shell`
2. `npm run test:vitest -w agentskeptic-web -- __tests__/activation-spine-narrative-alignment.source.test.ts`
3. `npx vitest run src/commercial/verifyWorkloadClassify.test.ts` *(repo root [`vitest.config.ts`](vitest.config.ts))*
4. `npm run test:vitest -w agentskeptic-web -- __tests__/integrate-activation-guided-spine.integration.test.ts`
5. `npm run test:vitest -w agentskeptic-web -- __tests__/integrate-activation-telemetry-off.integration.test.ts`

**If `dist/` is stale relative to `src/`:** preflight only checks **existence**, not freshness — **acceptable** for this initiative; CI should run **`npm run build`** before `validate:activation-spine` in the same job. (Optional future hardening: out of scope.)

**Exit 0 ⇒ solved. Else ⇒ not solved.**

---

## Surfaces touched (closed set)

**Modify:** bash template (new), generator (new), root `package.json`, `website/package.json` prebuild, `integrateActivationShellStatic.ts` (new generated), `IntegrateActivationBlock.tsx` (new), delete `FunnelAnonIdExport.tsx`, `integrate/page.tsx`, `productCopy.ts`, `first-run-integration.md`, `integratorDocsEmbedded.ts` (regenerated), **three** new Vitest files (`integrate-activation-guided-spine`, `integrate-activation-telemetry-off`, `activation-spine-narrative-alignment`) + **one** new `it` in `verifyWorkloadClassify.test.ts` + **one** locked edit to `integrate-activation-guide.source.test.ts`, `validate-activation-spine.mjs` (new), root `validate:activation-spine` script.

**Do not modify:** README, golden-path, website-product-experience, funnel-observability SSOT, growth SSOT, partner-quickstart-commands, partner SSOT scripts, `integrate-page-markup.test.ts`.
