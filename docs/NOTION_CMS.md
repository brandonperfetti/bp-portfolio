# Notion CMS

## Purpose

Operational setup and runbook for the Notion-backed CMS runtime.

## Provider mode

- `CMS_PROVIDER=notion`: uses Notion CMS repositories for articles, pages, projects, tech, uses, and site settings.
- `CMS_PROVIDER=local`: operational fallback mode (non-Notion providers + empty article-safe states).

## Required Notion environment variables

```bash
NOTION_API_TOKEN=...
NOTION_API_VERSION=2025-09-03
NOTION_CMS_ARTICLES_DATA_SOURCE=collection://...
NOTION_CMS_PAGES_DATA_SOURCE=collection://...
NOTION_CMS_PROJECTS_DATA_SOURCE=collection://...
NOTION_CMS_TECH_DATA_SOURCE=collection://...
NOTION_CMS_USES_DATA_SOURCE=collection://...
NOTION_CMS_WORK_HISTORY_DATA_SOURCE=collection://...
NOTION_CMS_AUTHORS_DATA_SOURCE=collection://...
NOTION_CMS_SITE_SETTINGS_DATA_SOURCE=collection://...
NOTION_CMS_ROUTE_REGISTRY_DATA_SOURCE=collection://...
NOTION_CONTENT_DB_DATA_SOURCE=collection://...
```

Optional:

```bash
NOTION_CMS_WEBHOOK_EVENTS_DATA_SOURCE=collection://...
NOTION_CMS_DEFAULT_AUTHOR_PAGE_ID=...
NOTION_MAX_RETRY_AFTER_SECONDS=...
```

## Revalidation and webhook security

```bash
CMS_REVALIDATE_SECRET=...
NOTION_WEBHOOK_VERIFICATION_TOKEN=...
NOTION_WEBHOOK_SECRET=...
NOTION_ENABLE_ARTICLE_PROJECTION_SYNC=true
```

- `/api/revalidate` is used for tag-based revalidation.
- `/api/webhooks/notion` validates signature (`X-Notion-Signature`) and processes events.

## Canonical article model

- Canonical body source is `Source Article` block tree (not a single DB body field).
- Projection target is `Portfolio CMS - Articles`.
- `Search Index` (rich text) must exist in `Portfolio CMS - Articles`.
- Projection sync writes normalized body text into `Search Index` for fast header search.

## Projection sync endpoints

- `POST /api/cms/sync/articles`
- `POST /api/cms/sync/articles/reconcile`
- `POST /api/cms/sync/articles/replay-failures`
- `POST /api/cms/sync/articles/watchdog`
- `POST /api/cms/sync/articles/prepublish-gate`

Primary usage:

```bash
curl -X POST http://localhost:3000/api/cms/sync/articles \
  -H "Content-Type: application/json" \
  --data '{"secret":"<CMS_REVALIDATE_SECRET>"}'
```

## Content guardrails

- Articles:
  - `Topics/Tags` required for publish-safe rendering and faceting.
  - `Tech` should be tool/framework specific.
  - `Author` relation should be present on every article.
- Pages (`Portfolio CMS - Pages`):
  - `Status` should be `Published` (or `Approved`, mapper dependent).

## Operational checks

- Confirm Notion API version remains pinned to `2025-09-03`.
- Confirm webhook verification and signature validation are healthy.
- Confirm projection sync updates `Search Index` after source-article edits.
- Confirm header search returns results without fetching article block trees at request time.

## Related code paths

- Notion transport: `src/lib/cms/notion/*`
- CMS repositories: `src/lib/cms/*Repo.ts`
- Article runtime facade: `src/lib/articles.ts`
- Dynamic article route: `src/app/articles/[slug]/page.tsx`
- Webhook handler: `src/app/api/webhooks/notion/route.ts`
- Revalidate handler: `src/app/api/revalidate/route.ts`

## Reference

- Notion implementation plan:
  [BP-Portfolio Notion CMS Integration Implementation Plan (v3)](https://www.notion.so/30ebe01e1e0681178a77d6833a34b516)
