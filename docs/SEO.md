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

## Paginated list views (`?page=N`)

`/articles`, `/projects`, `/tech` and `/uses` share one URL contract (#88):
`?page=N`, absent meaning page 1, composing with each surface's filter params
(see `docs/NAVIGATION.md` for the contract itself). It is implemented as
**client-side windowing over the already-fetched set** (option (b), decided
2026-08-28): the route still fetches the whole publish-safe collection and
renders one page of it in the browser. No data-fetch, cache-key or
rendering-profile change — the routes stay `○ Static` and serve one HTML
document for every `?page=N`. The server-side end state (per-param server
rendering, paged repo reads, per-page canonicals) is tracked as **#121** and is
deliberately not foreclosed here.

The calls that follow from option (b):

- **Canonical stays the bare URL for every paginated view.** Per-page
  self-referencing canonicals would advertise distinct documents the static
  route does not actually serve. `page=1` is never written into the URL (the
  control drops the param), so the first page has exactly one address. Per-page
  canonicals arrive with server rendering in #121.
- **Paginated list URLs stay out of the sitemap.** `src/app/sitemap.ts`
  continues to list detail routes, which already cover every piece of content;
  discovery never depends on crawling page 2. `rel="prev"`/`rel="next"` are
  emitted on the Previous/Next controls — dead as a Google signal, harmless and
  honest as markup.
- **ItemList JSON-LD stays capped at the first 50 items overall** — the
  `301a8f3` behavior, unchanged. #88 called either choice defensible; under
  option (b) a per-page ItemList would be wrong for every page but the first,
  because the same document is served for every `?page=N`. The choice is
  restated in a comment in `src/app/(frontend)/articles/page.tsx`.
- **Page-2+ content requires client JS.** Accepted for now, and the main reason
  #121 exists; mitigated because paginated URLs are non-canonical and unlisted,
  and every article stays independently reachable through its detail route, the
  feed and `llms.txt`.

## Rules

- Never index gated bodies: teasers only in any public payload, feeds
  included.
- New public routes must be added to the sitemap and, when content-bearing,
  to llms.txt.
- Redirects for retired URLs go through plugin-redirects, not code.
