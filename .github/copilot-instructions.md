# BP Portfolio - AI Agent Instructions

Next.js App Router portfolio + provider-switched CMS platform (fallback local mode + Notion) with custom feature layers for search, Hermes chat, contact forms, and SEO routes.

## Essentials
- Package manager: `npm` (lockfile is `package-lock.json`)
- Primary commands:
  - `npm run dev`
  - `npm run build`
  - `npm run lint`
- Runtime baseline:
  - Next.js 16
  - React 19
  - TypeScript 5

## Environment Expectations
Core env vars:
- `NEXT_PUBLIC_SITE_URL`
- `OPENAI_API_KEY`
- `SENDGRID_API_KEY`

Optional env vars:
- `SENDGRID_MAILING_ID` or `SENDGRID_LIST_ID`
- `SENDGRID_DATA_RESIDENCY`
- `CONTACT_TO_EMAIL`
- `CONTACT_FROM_EMAIL`

## Project-Specific Rules
- Articles are CMS-first; local mode should gracefully render empty article states when Notion is disabled.
- Dynamic article route is `src/app/articles/[slug]/page.tsx`; preserve this shape.
- In Notion mode, `Source Article` page blocks are canonical article body source.
- Keep Notion API pinned to `NOTION_API_VERSION=2025-09-03`.
- Preserve query-string behavior in article explorer (`q`, `topic`) and keyboard shortcuts (`/` for focus).
- Preserve header search UX (`Cmd/Ctrl + K`) and debounced matching over article body text.
- Hermes chat must keep streaming behavior and markdown rendering compatibility.
- Prefer project-local icons in `src/icons` when matching existing visual language; use Heroicons selectively where already adopted.

## Dependency Security Rules
- For dependency additions, upgrades, or removals, prioritize Sonatype MCP tools first.
- Before changing dependencies, check current package risk and recommended versions with Sonatype MCP.
- When proposing upgrades, include security impact and compatibility risk (major vs minor/patch).
- Keep vulnerability blocking strict; warning-only signals (e.g., scorecard/license metadata noise) should be documented and triaged separately.

## Progressive Disclosure
- Architecture and app map: `docs/ARCHITECTURE.md`
- Feature inventory and behavior: `docs/FEATURES.md`
- Navigation and route responsibilities: `docs/NAVIGATION.md`
- State and data flow: `docs/STATE.md`
- Styling and component conventions: `docs/STYLING.md`
- SEO and indexing routes: `docs/SEO.md`
- Dependencies and why they exist: `docs/DEPENDENCIES.md`
- Workflow and contribution rules: `docs/WORKFLOW.md`
- Accessibility expectations: `docs/ACCESSIBILITY.md`
- Testing strategy / current gaps: `docs/TESTING.md`
- Ongoing upkeep tasks: `docs/MAINTENANCE.md`
- Documentation standards: `docs/DOCUMENTATION.md`
- Notion CMS setup and runbook: `docs/NOTION_CMS.md`
