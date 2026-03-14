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
# Required for content-calendar seeding cron.
NOTION_CONTENT_CALENDAR_DATA_SOURCE=collection://...
```

Optional:

```bash
NOTION_CMS_WEBHOOK_EVENTS_DATA_SOURCE=collection://...
NOTION_CMS_AUTOMATION_ERRORS_DATA_SOURCE=collection://...
NOTION_IMAGE_JOBS_DATA_SOURCE=collection://...
NOTION_CMS_DEFAULT_AUTHOR_PAGE_ID=...
NOTION_MAX_RETRY_AFTER_SECONDS=...
```

## Revalidation and webhook security

```bash
CMS_REVALIDATE_SECRET=...
CRON_SECRET=...
NOTION_WEBHOOK_VERIFICATION_TOKEN=...
NOTION_WEBHOOK_SECRET=...
NOTION_ENABLE_ARTICLE_PROJECTION_SYNC=true
```

- `/api/revalidate` is used for tag-based revalidation.
- `/api/webhooks/notion` validates signature (`X-Notion-Signature`) and processes events.
- Notion webhook signatures are generated using the subscription `verification_token`.
  Configure `NOTION_WEBHOOK_VERIFICATION_TOKEN`, or set `NOTION_WEBHOOK_SECRET` to the same value.

## Canonical article model

- Canonical body source is `Source Article` block tree (not a single DB body field).
- Projection target is `Portfolio CMS - Articles`.
- `Search Index` (rich text) must exist in `Portfolio CMS - Articles`.
- Projection sync writes normalized body text into `Search Index` for fast header search.
- Future-dated articles are intentionally excluded from both `/articles` and header search modal payloads until their publish date is reached.

## Content Calendar schema (for seeding automation)

The `Content Calendar` data source should include:

- `Topic/Title` (title)
- `Status` (select)
- `Content Type` (select)
- `Publish Date` (date)
- `Hook Strategy` (select)
- `Content Pillar` (select)
- `Target Audience` (multi-select)
- `Technology Dependencies` (multi-select)

Seeder defaults:

- Missing `Target Audience` is treated as `Tech Workers`.
- Missing `Technology Dependencies` is treated as `None - Timeless`.

## Projection sync endpoints

- `POST /api/cms/sync/articles`
- `POST /api/cms/sync/articles/reconcile`
- `POST /api/cms/sync/articles/replay-failures`
- `POST /api/cms/sync/articles/watchdog`
- `POST /api/cms/sync/articles/prepublish-gate`
- `POST /api/cms/sync/articles/quality-gate`
- `POST /api/cms/sync/articles/auto-heal`
- `POST /api/cms/sync/articles/cover-regeneration`
- `GET /api/cron/cms-integrity` (or `POST`)
- `GET /api/cron/cms-projection` (or `POST`)
- `GET /api/cron/cms-cover-regeneration` (or `POST`)
- `GET /api/cron/cms-cleanup` (or `POST`)
- `GET /api/cron/cms-automation-errors-retention` (or `POST`)
- `GET /api/cron/cms-automation` (or `POST`)
- `GET /api/cron/content-calendar-seeding` (or `POST`)
- `GET /api/cron/cms-tech-curation` (or `POST`)

Primary usage:

```bash
curl -X POST http://localhost:3000/api/cms/sync/articles \
  -H "Content-Type: application/json" \
  --data '{"secret":"<CMS_REVALIDATE_SECRET>"}'

# Audit publish-safe source rows for SOP consistency gaps.
curl -X POST http://localhost:3000/api/cms/sync/articles/quality-gate \
  -H "Content-Type: application/json" \
  --data '{"secret":"<CMS_REVALIDATE_SECRET>"}'

# Auto-fill missing SOP quality defaults on publish-safe source rows.
curl -X POST http://localhost:3000/api/cms/sync/articles/auto-heal \
  -H "Content-Type: application/json" \
  --data '{"secret":"<CMS_REVALIDATE_SECRET>"}'

# Process cover regeneration requests (supports optional limit/sourcePageId).
curl -X POST http://localhost:3000/api/cms/sync/articles/cover-regeneration \
  -H "Content-Type: application/json" \
  --data '{"secret":"<CMS_REVALIDATE_SECRET>","limit":2}'

# Run full cron automation flow manually (projection, quality-heal, cover regen, reconcile, watchdog).
curl -X GET http://localhost:3000/api/cron/cms-automation \
  -H "Authorization: Bearer <CRON_SECRET>"

# Run integrity maintenance (projection + quality gate + auto-heal + reconcile + watchdog).
curl -X GET http://localhost:3000/api/cron/cms-integrity \
  -H "Authorization: Bearer <CRON_SECRET>"

# Backward-compatible alias for the same integrity workflow.
curl -X GET http://localhost:3000/api/cron/cms-projection \
  -H "Authorization: Bearer <CRON_SECRET>"

# Run cover-regeneration maintenance only.
curl -X GET http://localhost:3000/api/cron/cms-cover-regeneration \
  -H "Authorization: Bearer <CRON_SECRET>"

# Run automation-error retention cleanup only.
curl -X GET http://localhost:3000/api/cron/cms-automation-errors-retention \
  -H "Authorization: Bearer <CRON_SECRET>"

# Run cleanup maintenance (archive stale failed webhook ledger rows, prune automation errors,
# and optionally archive non-winner completed image jobs past retention).
curl -X GET http://localhost:3000/api/cron/cms-cleanup \
  -H "Authorization: Bearer <CRON_SECRET>"

# Run content-calendar idea seeding (LLM + Notion write path, supports dry-run env mode).
curl -X GET http://localhost:3000/api/cron/content-calendar-seeding \
  -H "Authorization: Bearer <CRON_SECRET>"

# Force dry-run for ad-hoc validation (no Notion row creation).
curl -X GET "http://localhost:3000/api/cron/content-calendar-seeding?dryRun=1" \
  -H "Authorization: Bearer <CRON_SECRET>"

# Run tech curation from GitHub signals (updates/creates Notion tech rows).
curl -X GET http://localhost:3000/api/cron/cms-tech-curation \
  -H "Authorization: Bearer <CRON_SECRET>"

# Force dry-run for tech curation (preview only, no writes).
curl -X GET "http://localhost:3000/api/cron/cms-tech-curation?dryRun=1" \
  -H "Authorization: Bearer <CRON_SECRET>"

```

Portfolio backlog synchronization (Notion as engineering ticketing/backlog system)
is documented separately in `docs/PORTFOLIO_BACKLOG.md`.

Optional cover regeneration hosting config:

```bash
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
# Optional override; default is bp-portfolio/articles.
CLOUDINARY_CMS_COVERS_FOLDER=bp-portfolio/articles
# Optional cap for cron cover-regeneration throughput.
CMS_COVER_REGEN_CRON_LIMIT=2
# Integrity cron runtime tuning:
# - full: run projection + quality gate + auto-heal + reconcile + watchdog every run
# - incremental: run projection-only on most cron invocations
CMS_INTEGRITY_FORCE_MODE=
# When running via Vercel cron and force mode is unset, run one full integrity pass
# every N scheduled windows (default: 6 => hourly when cron is every 10 minutes).
CMS_INTEGRITY_DEEP_RUN_INTERVAL=6
# Optional phase offset for deep windows.
CMS_INTEGRITY_DEEP_RUN_OFFSET=0
# Error-log retention settings (archive old rows).
CMS_AUTOMATION_ERRORS_RETENTION_DAYS=30
CMS_AUTOMATION_ERRORS_RETENTION_LIMIT=100
# Failed webhook-event ledger cleanup retention.
CMS_WEBHOOK_EVENTS_RETENTION_DAYS=30
CMS_WEBHOOK_EVENTS_RETENTION_LIMIT=100
# Optional Image Jobs cleanup retention.
CMS_IMAGE_JOBS_RETENTION_DAYS=30
CMS_IMAGE_JOBS_CLEANUP_LIMIT=100
# Optional fallback mode for rows missing explicit retention date.
CMS_IMAGE_JOBS_CLEANUP_ALLOW_FALLBACK_AGE=false
# Content calendar seeding controls.
CALENDAR_SEEDING_ENABLED=false
CALENDAR_SEEDING_DRY_RUN=true
CALENDAR_SEEDING_MODEL=gpt-5-mini
CALENDAR_SEEDING_COUNT=5
CALENDAR_SEEDING_CADENCE_DAYS=7
CALENDAR_SEEDING_MAX_CONTEXT_ROWS=80
CALENDAR_SEEDING_PILLAR_LOOKBACK_ROWS=10
CALENDAR_SEEDING_MAX_PILLAR_SHARE_PERCENT=40
# GitHub tech curation controls.
GITHUB_TOKEN=
GITHUB_OWNER=...
GITHUB_TECH_OWNER=...
GITHUB_TECH_REPOS_ALLOWLIST=...
GITHUB_TECH_REPOS_DENYLIST=...
GITHUB_TECH_REPO_LIMIT=60
GITHUB_TECH_MAX_REPO_AGE_MONTHS=24
GITHUB_TECH_MAX_PACKAGE_JSON_FILES_PER_REPO=20
GITHUB_TECH_INCLUDE_PRIVATE=false
TECH_CURATION_ENABLED=false
TECH_CURATION_DRY_RUN=true
TECH_CURATION_MIN_SCORE=4
TECH_CURATION_MAX_CANDIDATES=60
TECH_CURATION_AUTO_CREATE=false
TECH_CURATION_UPDATE_EXISTING=false
TECH_CURATION_DEFAULT_CREATE_STATUS=Review
TECH_CURATION_INCLUDE_UNMAPPED=false
TECH_CURATION_REQUIRE_AUTOMATION_MANAGED_FOR_UPDATES=true
TECH_CURATION_ENFORCE_INTEGRITY=true
# Optional dedicated folder for curated tech logos.
CLOUDINARY_CMS_TECH_LOGOS_FOLDER=bp-portfolio/tech
```

Content pillar policy:

- Canonical pillars: `Mindset`, `Software`, `Design`, `Leadership`, `Product Execution`.
- Calendar seeding now requires and writes `Content Pillar` for every generated row.
- Seeder uses recent lookback distribution and a max-per-run share cap to avoid one pillar dominating each seeded batch.
- Publish-safe source articles now require `Content Pillar`; quality auto-heal defaults it when missing.
- Auto-default heuristic (when `Content Pillar` is empty):
  - topic/tag signal wins first (`mindset`, `design`, `leadership`, `product`, `execution`).
  - `Hybrid` falls back to `Product Execution`.
  - everything else falls back to `Software`.

Cover regeneration retry behavior:

- If generation/upload fails, request remains queued until `Recovery Attempts` reaches 3.
- At 3 failed attempts, request is cleared and `Recovery Status` is set to `Needs Human Review`.
- Regeneration uses model `gpt-image-1.5` with a shared house-style prompt and A/B/C variant framing to match initial Image Jobs visual language.
- Optional article property: `Cover Style Profile` (aliases supported: `Image Style Profile`, `Cover Style`).
  - Recommended values:
    - `Editorial Realistic` (default)
    - `Technical Minimal`
    - `Studio Photoreal`
  - Unknown/custom values are treated as style-overrides in prompt text.
  - Auto-default mapping used by quality auto-heal when style is missing:
    - `Implementation Tutorial` -> `Technical Minimal`
    - `Tool Showcase` -> `Studio Photoreal`
    - `Concept Explainer` / `Hybrid` / unknown -> `Editorial Realistic`

Error-only Notion run logging:

- When configured, failures are written to `NOTION_CMS_AUTOMATION_ERRORS_DATA_SOURCE`.
- Success runs are intentionally not logged to avoid workspace noise.

Tech curation behavior:

- GitHub is discovery-only for this workflow.
- Missing GitHub-observed tech can be added as `Review`, but existing tech is not demoted based on GitHub absence.
- By default, updates only apply to rows marked as automation-managed
  when an `Automation Managed` (or alias) checkbox exists.
- Controls:
  - `GITHUB_TECH_MAX_REPO_AGE_MONTHS`
  - `GITHUB_TECH_MAX_PACKAGE_JSON_FILES_PER_REPO`
  - `TECH_CURATION_REQUIRE_AUTOMATION_MANAGED_FOR_UPDATES`
  - `TECH_CURATION_ENFORCE_INTEGRITY`
- Recommended telemetry fields on `Portfolio CMS - Tech`:
  - `Usage Score`, `Repo Count`, `Source Repos`
  - `GitHub Observed`, `GitHub Repo Mentions`, `GitHub Last Scanned At`
  - `Signal Sources` (multi-select)
  - `First Seen In GitHub`, `Last Seen In GitHub`
  - `Review Reason`

Vercel cron cadence (current):

- `/api/cron/cms-integrity` every 10 minutes.
- `/api/cron/cms-cover-regeneration` every 4 hours (minute 20).
- `/api/cron/cms-cleanup` weekly Friday at 23:00 UTC.
- `/api/cron/cms-automation-errors-retention` daily at 03:45.
- `/api/cron/content-calendar-seeding` weekly Monday at 18:00 UTC.
- `/api/cron/cms-tech-curation` weekly Monday at 18:30 UTC.
- `/api/cron/cms-projection` retained as a compatibility alias.
- `/api/cron/cms-automation` retained for manual full-run execution.
- `/api/cron/cms-integrity` supports explicit overrides:
  - `?deep=1` or `?mode=full` forces full integrity workflow.
  - `?deep=0` or `?mode=incremental` forces projection-only workflow.

Cache invalidation behavior:

- Webhook and article-mutation cron routes trigger `revalidateTag(cms:articles)` and path revalidation for `/` and `/articles`.
- Header search modal also uses session cache with a short TTL, so cron-updated content appears without hard refresh after the cache window expires.

## Runtime boundary (Cron vs Codex)

- Vercel cron routes run inside your deployed Next.js runtime.
  - They can use direct APIs/SDKs only (Notion API, OpenAI API, Cloudinary API, internal app code).
  - They cannot use Codex MCP servers or local Codex skills.
- Codex automations run in your Codex environment.
  - They can use MCP tools/skills and interactive agent workflows.
  - They are best for research-heavy or multi-tool authoring flows.

Recommended split:

- Production maintenance (deterministic): use cron routes `/api/cron/cms-integrity` and `/api/cron/cms-cover-regeneration`.
- Editorial/agentic generation workflows: keep in Codex automations.
- Handoff contract between both systems: Notion properties (for example `Content Status`, `Regenerate Cover Requested`, `Recovery Status`, `Cover Image URL`, `Has Required Metadata`).

Automation proposal checklist:

1. Classify runtime owner: `Cron-safe` or `Codex-only`.
2. List external dependencies:
   - Cron-safe must be direct API/SDK only.
   - Codex-only may require MCP tools/skills.
3. Define Notion handoff fields (inputs + outputs) and failure states.
4. Define auth model:
   - Cron route uses `Authorization: Bearer <CRON_SECRET>`.
   - Manual API routes use `CMS_REVALIDATE_SECRET`.
5. Define observability:
   - Error-only logs to `NOTION_CMS_AUTOMATION_ERRORS_DATA_SOURCE`.
   - No success-log noise by default.
6. Define retry and terminal behavior (max attempts, when to require human review).
7. Define throughput limits and schedule (for cron jobs, include run frequency + per-run caps).

## Content guardrails

- Articles:
  - `Topics/Tags` required for publish-safe rendering and faceting.
  - `Tech` should be tool/framework specific.
  - `Author` relation should be present on every article (recommended). Missing author no longer blocks projection; fallback author is used at runtime.
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
