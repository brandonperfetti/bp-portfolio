# Architecture

## Runtime Model

- Framework: Next.js App Router (`src/app`).
- Rendering:
  - Static and dynamic App Router rendering.
  - Dynamic API routes for chat, image generation, contact, newsletter, and search index.
- Content source:
  - Local provider: fallback mode with empty article-safe behavior.
  - Notion provider: metadata from `Portfolio CMS - Articles` data source and canonical body from `Source Article` page blocks.

## Primary Layers

- `src/app/`
  - Route handlers and page entries.
  - Dynamic article route (`src/app/articles/[slug]/page.tsx`).
  - SEO routes (`sitemap.ts`, `robots.ts`, feed route).
  - Metadata defaults in `layout.tsx`.
- `src/components/`
  - Reusable UI shell (`Layout`, `Header`, `Footer`, `Container`).
  - Feature components (`HermesChat`, `ArticlesExplorer`, `HeaderSearch`, `Messenger`).
- `src/lib/`
  - Provider facade and CMS repositories (`src/lib/cms/*`).
  - Article aggregation/parsing + metadata helpers.
  - Shared debouncing utility.
  - Work history provider (`src/lib/cms/workHistoryRepo.ts`) powers home-page resume data in Notion mode.
  - Page content provider (`src/lib/cms/pagesRepo.ts`) powers home/about hero + content slots in Notion mode.
- `src/icons/`
  - Project-local icon set.
- `src/styles/`
  - Tailwind v4 entry + Prism theme.

## Content + Search Pipeline

1. Provider facade resolves `local` or `notion` mode (`CMS_PROVIDER`).
2. Local mode returns empty article-safe data (non-Notion fallback behavior).
3. Notion mode reads article projection records + canonical Source Article blocks via `src/lib/cms/notion/*`.
4. Utility builds:
   - `readingTimeMinutes`
   - `searchText` (metadata + projected `Search Index` text)
   - `Search Index` is written during projection sync from canonical Source Article blocks
5. Search API (`/api/search`) emits a compact index consumed by header modal.

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
- `topic` = selected topic title
- `category` = legacy compatibility alias still read from URL
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
