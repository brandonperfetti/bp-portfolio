# SEO

## Metadata

- Per-page `generateMetadata` merges Payload data with defaults:
  `buildPageMetadata` (`src/lib/cms/pageMetadata.ts`) for CMS pages, article
  metadata from the plugin-seo `meta` group (title/description/image) with
  excerpt fallback.
- Canonical URL source of truth: `SiteSettings.canonicalUrl` when set, else
  `NEXT_PUBLIC_SITE_URL` (`src/lib/seo/canonical.ts` — tested).
- plugin-seo generation: title `{title} - Brandon Perfetti`; post URLs are
  prefixed `/articles`.

## Structured data

`src/lib/seo/jsonLd.ts` + `structuredData.ts` emit Person/Article/WebSite
JSON-LD (identity from the `Identity` global), serialized via `toSafeJsonLd`
(XSS-safe). Article pages include author, dates, and canonical.

## Indexing surfaces

- `src/app/sitemap.ts` — static routes + published articles + published
  page-builder pages. Regenerates hourly (`revalidate = 3600`); its data
  flows through the `posts`/`pages`-tagged caches, so content edits appear
  on the next hourly regeneration. (The `posts-sitemap`/`pages-sitemap`
  tags the hooks fire are aspirational — nothing subscribes to them yet.)
- `src/app/robots.ts` — allows crawling, disallows `/admin`, `/api`.
- `/feed.xml` — RSS via `feed` from published posts.
- `/llms.txt` + `/llms-full.txt` — LLM discovery endpoints
  (`src/lib/llms/helpers.ts`): site map summary, and per-article metadata +
  summaries (deliberately NOT full bodies — full-corpus emission would leak
  gated content; keep it that way).

## Rules

- Never index gated bodies: teasers only in any public payload, feeds
  included.
- New public routes must be added to the sitemap and, when content-bearing,
  to llms.txt.
- Redirects for retired URLs go through plugin-redirects, not code.
