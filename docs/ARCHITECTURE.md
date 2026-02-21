# Architecture

## Runtime Model

- Framework: Next.js App Router (`src/app`).
- Rendering:
  - Static content for most pages/articles.
  - Dynamic API routes for chat, image generation, contact, newsletter, and search index.
- Content source:
  - MDX files under `src/app/articles/**/page.mdx`.

## Primary Layers

- `src/app/`
  - Route handlers and page entries.
  - SEO routes (`sitemap.ts`, `robots.ts`, feed route).
  - Metadata defaults in `layout.tsx`.
- `src/components/`
  - Reusable UI shell (`Layout`, `Header`, `Footer`, `Container`).
  - Feature components (`HermesChat`, `ArticlesExplorer`, `HeaderSearch`, `Messenger`).
- `src/lib/`
  - Article aggregation/parsing + metadata helpers.
  - Shared debouncing utility.
- `src/icons/`
  - Project-local icon set.
- `src/styles/`
  - Tailwind v4 entry + Prism theme.

## Content + Search Pipeline

1. `getAllArticles()` globs MDX files.
2. Each file is imported for frontmatter metadata and read from disk for content.
3. Utility builds:
   - `readingTimeMinutes`
   - `searchText` (normalized article body text)
4. Search API (`/api/search`) emits a compact index consumed by header modal.

### Key files

- `src/lib/articles.ts`
- `src/app/api/search/route.ts`
- `src/components/articles/ArticlesExplorer.tsx`
- `src/components/search/HeaderSearch.tsx`

## Route Highlights

- `/articles` uses `ArticlesExplorer` for client-side filtering/search.
- `/hermes` hosts AI chat UI and calls OpenAI endpoints.
- `/api/openai/chat` streams NDJSON token chunks.
- `/api/openai/image` returns base64 image payload.
- `/api/sendgrid` handles contact form email send.
- `/api/mailinglist` uses SendGrid marketing contacts API.

Search/filter URL contract:

- `q` = text query
- `category` = selected category title
- Updates are applied with `router.replace(..., { scroll: false })` to keep context stable.

Keyboard shortcuts:

- Global: `Cmd/Ctrl + K` opens/closes header search modal.
- Articles + Hermes inputs: `/` focuses the active page input when not already typing in another field.

## Layout Composition

- Global layout defined in `src/app/layout.tsx`.
- `src/components/Layout.tsx` composes:
  - Sticky/animated header
  - page body
  - footer (hidden on `/hermes` for chat-focused viewport)

Hermes layout note:

- `src/app/hermes/page.tsx` computes viewport-fit height and keeps scrolling inside the message panel instead of page-level overflow.
