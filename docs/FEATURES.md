# Features

## Content Platform

- Provider-switched article system:
  - `local`: fallback mode with empty article-safe states
  - `notion`: projection records in `Portfolio CMS - Articles` + canonical body from related `Source Article` page blocks
- Dynamic article route: `/articles/[slug]`
- Article detail supports topic + tech chips, hero media, and Notion block rendering.

## Article Discovery

- `/articles` explorer supports:
  - text search over title + description + taxonomy + server-provided `searchText`
  - topic filtering with chip controls
  - URL persistence (`q`, `topic`)
  - chip re-click to clear selection back to `All`
  - `/` keyboard shortcut to focus search input
- Empty-state handling uses shared `NotFoundState` for publish-safe parity across CMS pages.

## Global Header Search

- Modal search opens via button or `Cmd/Ctrl + K`.
- Uses debounced client filtering over a compact `/api/search` index payload.
- Session cache keeps modal reopen fast within a tab.
- API route includes stale payload fallback to reduce transient Notion failures.

## Hermes AI Chat

- Streaming assistant responses (`gpt-4.1-mini`).
- Markdown rendering with GFM support inside assistant bubble.
- Copy-to-clipboard for assistant text responses.
- Image mode via `image:` or `dali:` prompt prefix (`gpt-image-1`).

## Contact + Newsletter APIs

- Contact form (`/api/sendgrid`) sends transactional email via SendGrid Mail API.
- Newsletter route (`/api/mailinglist`) writes contacts to SendGrid Marketing list.
- Home-page newsletter card is currently disabled at render level, but backend route remains available.

## SEO + Discoverability

- Dynamic sitemap generated from all routes + article slugs.
- Robots route.
- Feed metadata route (`/feed.xml`).
- Metadata defaults configured at app layout and overridden on article pages.
