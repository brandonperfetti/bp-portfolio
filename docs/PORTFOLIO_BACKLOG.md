# Portfolio Backlog

## Purpose

This document covers engineering backlog operations where Notion is used as a
ticketing/planning system (not as CMS content delivery storage).

Keep this concern separate from `docs/NOTION_CMS.md`, which is for runtime
content operations (articles/pages/tech/uses and publish flows).

## Source of truth

- Canonical backlog data source: Notion `Portfolio Engineering Backlog`.
- Local mirror for codebase visibility: `docs/PORTFOLIO_BACKLOG_TODOS.md`.

## Environment

```bash
NOTION_PORTFOLIO_BACKLOG_DATA_SOURCE=collection://...
CRON_SECRET=...
# Fallback accepted by cron auth helper:
CMS_REVALIDATE_SECRET=...
```

## Manual sync flow (current)

Manual sync is the current operating mode by design.

1. Start app locally: `npm run dev`
2. Run sync command: `npm run sync:portfolio-backlog`
3. Review changes in `docs/PORTFOLIO_BACKLOG_TODOS.md`

The command calls:

- `POST /api/cron/cms-portfolio-backlog-sync` with JSON body `{"write": true}`

Auth:

- `Authorization: Bearer <CRON_SECRET>`
- Fallback accepted by server auth helper: `CMS_REVALIDATE_SECRET`

## Route behavior

- Route: `src/app/api/cron/cms-portfolio-backlog-sync/route.ts`
- Sync service: `src/lib/cms/notion/portfolioBacklogSync.ts`
- Output file: `docs/PORTFOLIO_BACKLOG_TODOS.md`

Current semantics:

- Pull active backlog rows from Notion.
- Render deterministic Markdown checklist entries.
- Write Markdown only when `write`/`writeFile` resolves true.

## Automation policy

- CI/cron automation is intentionally deferred and tracked as backlog work.
- Until that is implemented, treat manual sync as required before:
  - PR finalization that references backlog items
  - release handoff notes
  - documentation updates that claim backlog parity
