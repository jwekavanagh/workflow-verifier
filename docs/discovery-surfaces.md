# Discovery surfaces

Single place for **which URLs are indexable**, which stay **private**, and how they relate to **`llms.txt`** and the **sitemap**.

## Scope

This document covers **human and agent discovery** for the AgentSkeptic website. Wire formats for posting private reports remain in [`shareable-verification-reports.md`](shareable-verification-reports.md). Authoring steps for `/guides/*` pages remain in [`discovery-guides.md`](discovery-guides.md).

## Indexable routes

- **Acquisition slug** from `config/discovery-acquisition.json` → `slug` (currently `/database-truth-vs-traces`).
- **`/guides/*`** — only paths listed in `indexableGuides[]`; each has `metadata.robots` indexable and appears in `sitemap.xml` and under `## Indexable guides` in `llms.txt`.
- **`/examples/*`** — only paths listed in `indexableExamples[]` (currently `/examples/wf-complete` and `/examples/wf-missing`); same indexability rules as guides. They render **committed** public-report JSON, not database-backed rows.
- **Hub pages** `/guides` and `/examples` are **noindex, follow** and are **not** listed alone in `sitemap.xml` (same pattern as `/guides` before examples existed).

## Private routes

- **`GET /r/{id}`** — persisted user reports when enabled; **`noindex, nofollow`**; **must not** appear in `sitemap.xml`. See [`shareable-verification-reports.md`](shareable-verification-reports.md).

## Sync commands

From repository root after editing `config/discovery-acquisition.json` or anchors:

- `npm run sync:public-product-anchors`
- `npm run check:discovery-acquisition`

## Embed redaction

Before committing new JSON derived from real runs, follow the redaction guidance in [`discovery-guides.md`](discovery-guides.md) (`## Redaction`).
