# Notion Integration

## Purpose

Current-state reference for how BP Portfolio integrates with Notion at runtime, including data ownership, API surfaces, and operational guardrails.

## Provider Model

- `CMS_PROVIDER=notion`: app reads CMS content from Notion repositories.
- `CMS_PROVIDER=local`: app uses local fallback content and must still render safe empty states for CMS-first surfaces.

Provider resolution is handled by `src/lib/cms/provider.ts`.

## Required Runtime Baseline

- `NOTION_API_VERSION` must remain pinned to `2025-09-03`.
- Notion client and request safeguards are implemented in `src/lib/cms/notion/client.ts`.
- Core CMS cache policy/tags are defined in `src/lib/cms/cache.ts`.

## Data Sources in Use

Configured via env vars in `src/lib/cms/notion/config.ts`.

Core:

- `NOTION_CMS_ARTICLES_DATA_SOURCE`
- `NOTION_CMS_PAGES_DATA_SOURCE`
- `NOTION_CMS_PROJECTS_DATA_SOURCE`
- `NOTION_CMS_TECH_DATA_SOURCE`
- `NOTION_CMS_USES_DATA_SOURCE`
- `NOTION_CMS_WORK_HISTORY_DATA_SOURCE`
- `NOTION_CMS_AUTHORS_DATA_SOURCE`
- `NOTION_CMS_SITE_SETTINGS_DATA_SOURCE`
- `NOTION_CMS_ROUTE_REGISTRY_DATA_SOURCE`
- `NOTION_CONTENT_DB_DATA_SOURCE`

Optional/operational:

- `NOTION_CMS_WEBHOOK_EVENTS_DATA_SOURCE`
- `NOTION_CMS_AUTOMATION_ERRORS_DATA_SOURCE`
- `NOTION_IMAGE_JOBS_DATA_SOURCE`
- `NOTION_CONTENT_CALENDAR_DATA_SOURCE`

## Canonical Contracts

### Article Source of Truth

- Canonical article body comes from `Source Article` page blocks (Notion block tree), not from projection body fields.
- Content authoring/editorial state belongs to the source content data source.

### Projection Contract

- `Portfolio CMS - Articles` is a delivery/read model.
- Projection sync is one-way from source content to projection.
- Agents/operators should not manually edit projection rows to force publishing behavior.

### URL Contract

- Canonical site URL should resolve from CMS site settings (`canonicalUrl`) when present.
- Fallback is `NEXT_PUBLIC_SITE_URL`.

## Runtime Read Paths

Primary repository layer lives in `src/lib/cms/*Repo.ts` and is protected with `unstable_cache` plus `CMS_TAGS`.

Main reads:

- Articles/search/article detail: `src/lib/cms/articlesRepo.ts`
- CMS pages: `src/lib/cms/pagesRepo.ts`
- Site settings: `src/lib/cms/siteSettingsRepo.ts`
- Navigation: `src/lib/cms/navigationRepo.ts`
- Projects/Tech/Uses/Work History/Authors: corresponding repos under `src/lib/cms/`

## Runtime Write and Sync Paths

### Notion Webhook

`POST /api/webhooks/notion` (`src/app/api/webhooks/notion/route.ts`):

- Verifies Notion signature (`X-Notion-Signature`) and supports setup token handshake.
- Applies cache/path revalidation via tags and route invalidation.
- Runs projection sync for eligible events when enabled.
- Uses durable dedupe/claim flow when webhook ledger data source is configured.

### Manual/Automation Sync APIs

`/api/cms/sync/articles/*` endpoints are the operational write surface for projection maintenance:

- `/api/cms/sync/articles`
- `/api/cms/sync/articles/reconcile`
- `/api/cms/sync/articles/replay-failures`
- `/api/cms/sync/articles/watchdog`
- `/api/cms/sync/articles/prepublish-gate`
- `/api/cms/sync/articles/quality-gate`
- `/api/cms/sync/articles/auto-heal`
- `/api/cms/sync/articles/cover-regeneration`

All require `CMS_REVALIDATE_SECRET` authorization checks.

### Cron Orchestration

Cron endpoints under `src/app/api/cron/*` coordinate integrity, sync, cleanup, and maintenance.
They are protected by `CRON_SECRET` (or fallback `CMS_REVALIDATE_SECRET`).

## Revalidation Model

- Canonical tag registry: `CMS_TAGS` in `src/lib/cms/cache.ts`.
- Notion webhook events call `revalidateTag(...)` and selected `revalidatePath(...)` for critical surfaces (`/`, `/articles`, `/projects`, `/tech`, `/uses`, sitemap/feed/llms routes).

## Failure Behavior

- If Notion is unavailable/misconfigured, repos catch `NotionConfigError`/`NotionHttpError` and fall back to safe local behavior where implemented.
- Webhook processing is fail-open for some missing metadata cases to avoid blocking updates, while logging diagnostics.
- Projection sync failures are surfaced in API responses/logs and can be replayed with dedicated endpoints.

## Governance and Operations References

- Governance root: `Governance Hub` in Notion.
- SOP run/evidence destination: `Operations Runs` database in Notion.
- Operational SOP details remain in Engineering SOPs and `docs/NOTION_CMS.md`.

## Change Checklist (When Modifying Integration)

1. Confirm data ownership contract (source vs projection) is unchanged or intentionally updated.
2. Update mapper/repo logic and corresponding env documentation together.
3. Validate webhook signature and projection behavior in local/dev.
4. Verify cache invalidation tags and route revalidation still cover affected surfaces.
5. Update SOP references if operational workflow changes.
