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

- Add article under `src/app/articles/<slug>/page.mdx`.
- Export `article` metadata object in file.
- Verify article appears:
  - in `/articles`
  - in header search modal results
  - in sitemap route output

## Feature Work Principles

- Reuse existing component patterns before introducing new abstractions.
- Preserve keyboard shortcuts (`Cmd/Ctrl+K`, `/`) unless intentionally redesigning UX.
- Keep API route error responses user-safe and log-friendly.

## Branching / PR Hygiene

- Keep PR scope narrow and documented.
- Update `README.md` + affected `docs/*.md` when behavior or architecture changes.
