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

### Which title wins, and whether the site name is appended (#176)

The root layout (`src/app/(frontend)/layout.tsx`) sets
`title.template = "%s - <siteName>"`, so anything returned as a plain string
gets ` - Brandon Perfetti` appended.

- **An authored SEO title is FINAL.** When an editor fills the `meta.title`
  field on a page (or an article), that exact string is the `<title>` — nothing
  is appended. If you want the site name in it, type it in. This is
  `title: { absolute: … }` in `buildPageMetadata` and in the articles route.
  The same rule applies to **CMS-composed pages served by the `[...segments]`
  catch-all** (`/work/<slug>` and any future section page): that route builds
  its own metadata, so both call one shared helper,
  `resolvePageMetadataTitle` in `src/lib/cms/pageMetadata.ts`.
- **No SEO title ⇒ the route's own title, plus the suffix.** The fallback
  (`Home`, `About`, …) is a bare route name, so the template applies and the
  tab reads `About - Brandon Perfetti`.
- **`openGraph.title` / `twitter.title` never take the template**, in either
  case; they are always the exact string.

Practical consequence for editors: an SEO title that already contains
"Brandon Perfetti" no longer ships it twice. Keep authored titles under ~60
characters — that is where search engines truncate, and the duplicate suffix
used to consume the part you wrote to be the differentiator.

## Structured data

`src/lib/seo/jsonLd.ts` + `structuredData.ts` emit Person/Article/WebSite
JSON-LD (identity from the `Identity` global), serialized via `toSafeJsonLd`
(XSS-safe). Article pages include author, dates, and canonical.

## Indexing surfaces

- `src/app/sitemap.ts` — static routes + published articles + published
  page-builder pages. **Corrected 2026-09-10 (#209):** it has not regenerated
  "hourly (`revalidate = 3600`)" since #76 removed that export — the data is
  prepared in a `getSitemapData` scope on `cacheLife('cmsContent')`, which is
  stale 300 s / revalidate 6 h / expire 24 h (`next.config.mjs`). And an edit no
  longer waits for that cadence: the Pages and Posts hooks call
  `revalidatePath('/sitemap.xml')` on publish, unpublish and delete. That call
  is the mechanism — `getSitemapData` is a **plain** `'use cache'` scope, so its
  `posts`/`pages` tag purges reach only the instance that issued them, which is
  how a published page stayed out of a freshly generated sitemap for 28.5 h
  `[measured, prod 2026-09-09]`. The `posts-sitemap`/`pages-sitemap` tags that
  used to be fired here were subscribed by nothing and are **deleted**, not
  waiting for a subscriber.
- `src/app/robots.ts` — **corrected 2026-09-10 (#209):** it allows crawling
  with no `Disallow` at all (`[measured, prod robots.txt 2026-09-09]`:
  `User-Agent: *` / `Allow: /` / `Host:` / `Sitemap:`). The previous sentence
  claimed `Disallow` entries for `/admin` and `/api` that the file does not
  emit. Whether it SHOULD emit them is a separate decision, tracked on #210's
  follow-ups; this line now describes what is served.
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
- **List content requires client JS on _every_ page, page 1 included.** This
  bullet used to read "Page-2+", which understated the cost by a whole page.
  All four surfaces render their list from a client component that reads
  `useSearchParams()` under `<Suspense>` — `ArticlesExplorer`, `EntityGrid`
  (projects), `TechExplorer`, `UsesSections` — and that read makes Next bail
  out of prerendering the boundary, so the static HTML ships the fallback
  ("Loading articles…" and its siblings) rather than any cards at all. A
  crawler that never runs JS sees zero list items on `/articles`, not "the
  first 12". Option (b) did not introduce that; it inherited it from the
  `?page=N` read, which is exactly why the cost cannot be scoped to page 2 and
  up. Accepted for now, and the main reason #121 exists; mitigated because
  paginated URLs are non-canonical and unlisted, because the server-rendered
  ItemList JSON-LD still carries the first 50 articles' titles and canonical
  URLs in the HTML, and because every article stays independently reachable
  through its detail route, the feed and `llms.txt`.

## Rules

- Never index gated bodies: teasers only in any public payload, feeds
  included.
- New public routes must be added to the sitemap and, when content-bearing,
  to llms.txt.
- Redirects for retired URLs go through plugin-redirects, not code.
