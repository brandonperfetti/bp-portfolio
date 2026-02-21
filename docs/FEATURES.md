# Features

## Content Platform

- 40+ MDX articles with metadata, category tags, images, and reading-time estimates.
- Article cards include date, read time, category chips, and author metadata.

## Article Discovery

- `/articles` explorer supports:
  - text search over title + description + full article content
  - category chip filtering
  - query string persistence (`q`, `category`)
  - chip re-click to clear selection
  - `/` keyboard shortcut to focus search input

## Global Header Search

- Modal search opens via button or `Cmd/Ctrl + K`.
- Debounced query and ranked subset display.
- Click outside / Escape closes modal with clear behavior.

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
