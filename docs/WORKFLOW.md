# Workflow

## Local Dev Flow

1. `npm install`
2. Configure `.env.local`
3. `npm run dev`
4. Validate changed route(s) in both light and dark theme when relevant.

## Build/Lint Gate

Before merging significant changes:

- `npm run lint`
- `npm run build`
- Linting is configured via flat config in `eslint.config.mjs`.

## Content Workflow (Articles)

- Local provider: no local article corpus; expect empty article-safe states.
- Dynamic route delivery remains `src/app/articles/[slug]/page.tsx`.
- Notion provider: keep canonical body in `Source Article` page blocks (not a single DB body text field).
- Notion provider: assign `Author` relation for every article (required for publish); default author fallback is safety only.
- Notion provider: ensure `Portfolio CMS - Articles` has a `Search Index` rich-text property. Projection sync writes normalized body text there from `Source Article` so `/api/search` does not need to fetch all block trees at request time.
- If projection sync is used, set `NOTION_CMS_DEFAULT_AUTHOR_PAGE_ID` so newly projected articles are automatically assigned an author.
- Verify article appears:
  - in `/articles`
  - in header search modal results
  - in sitemap route output

For complete Notion setup and operations (env variables, webhook security, projection sync endpoints), see `docs/NOTION_CMS.md`.

## Content Workflow (Pages CMS)

- Source: `Portfolio CMS - Pages` (`NOTION_CMS_PAGES_DATA_SOURCE`).
- Current consumers:
  - `/` (home hero + featured image strip)
  - `/about` (hero + body content block tree)
- Publish rule:
  - `Status` must be `Published` (or `Approved` where supported in mapper).
- Social image fallback chain for page metadata:
  1. `OG Image`
  2. `Hero Image`
  3. Site-level OG image from `Portfolio CMS - Site Settings`
  4. Hardcoded default social image

## Feature Work Principles

- Reuse existing component patterns before introducing new abstractions.
- Preserve keyboard shortcuts (`Cmd/Ctrl+K`, `/`) unless intentionally redesigning UX.
- Keep API route error responses user-safe and log-friendly.

## Branching / PR Hygiene

- Keep PR scope narrow and documented.
- Update `README.md` + affected `docs/*.md` when behavior or architecture changes.
