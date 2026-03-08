# BP Portfolio - AI Agent Instructions

Next.js App Router portfolio + provider-switched CMS platform (fallback local mode + Notion) with custom feature layers for search, Hermes chat, contact forms, and SEO routes.

## Essentials

- Package manager: `npm` (lockfile is `package-lock.json`)
- Primary commands:
  - `npm run dev`
  - `npm run build`
  - `npm run lint`
  - `npm run test`
  - `npm run test:e2e`
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

## Code Documentation Expectations

- Add concise comments for non-obvious logic, edge-case handling, and tradeoffs.
- Avoid narrating obvious code ("set x to y"); comments should explain intent/why.
- Add JSDoc for exported components/hooks/utilities when contracts are non-trivial (inputs, return shape, side effects, assumptions).
- Prefer keeping comments near complex branches and transformations so future edits are safe.
- If behavior changes, update nearby comments/JSDoc in the same change.

## Dependency Security Rules

- For dependency additions, upgrades, or removals, prioritize Sonatype MCP tools first.
- Before changing dependencies, check current package risk and recommended versions with Sonatype MCP.
- When proposing upgrades, include security impact and compatibility risk (major vs minor/patch).
- Keep vulnerability blocking strict; warning-only signals (e.g., scorecard/license metadata noise) should be documented and triaged separately.

## Test Update Policy

- If a change modifies user-visible behavior, add or update at least one automated test that covers the new behavior.
- UI interaction/state updates should include Playwright coverage and/or a component test (`@testing-library/react` + Vitest).
- Pure logic/data transformations should include or update Vitest unit tests.
- Motion/accessibility changes must include keyboard-path and reduced-motion validation (automated when practical, otherwise explicit manual checklist notes).
- Bug-fix changes should include a regression test that fails before the fix and passes after.
- If no new test is added, document the reason in PR testing notes.

## Review Suggestion Triage

- Not every automated review suggestion should be applied verbatim; verify against current code and product intent first.
- If intentionally skipping a valid suggestion due to scope/timing, leave:
  - a short PR note explaining why, and
  - an inline comment only when the skipped choice is non-obvious to future editors.
- For deferred-but-valid work, add a TODO/backlog reference with enough context for follow-up.

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
