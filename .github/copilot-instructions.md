# BP Portfolio - AI Agent Instructions

Next.js App Router portfolio + MDX content platform (Tailwind Plus Spotlight-based) with custom feature layers for search, Hermes chat, contact forms, and SEO routes.

## Essentials
- Package manager: `npm` (lockfile is `package-lock.json`)
- Primary commands:
  - `npm run dev`
  - `npm run dev:turbo`
  - `npm run build`
  - `npm run lint`
- Runtime baseline:
  - Next.js 15
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
- Keep article content and metadata co-located in `src/app/articles/**/page.mdx`.
- Preserve query-string behavior in article explorer (`q`, `category`) and keyboard shortcuts (`/` for focus).
- Preserve header search UX (`Cmd/Ctrl + K`) and debounced matching over article body text.
- Hermes chat must keep streaming behavior and markdown rendering compatibility.
- Prefer project-local icons in `src/icons` when matching existing visual language; use Heroicons selectively where already adopted.

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
