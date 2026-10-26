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
  page-builder pages, assembled **per request** (#209, fallback (b)). The
  route awaits `connection()` from `next/server` before any read, so the
  build does not prerender it and no cached route response exists. There is
  no `'use cache'` scope in the file. `[inference]`: the build is expected to
  report the route as dynamic (`ƒ`), as #209 measured locally for an uncached
  assembly, but no `next build` has measured this exact change. What stays
  cached is the two inner reads: `getPublishedPostSummaries` (through
  `getAllArticles`) and `getPublishedPagePaths`. Both are
  **`'use cache: remote'`** scopes tagged `posts` / `pages` on
  `cacheLife('cmsContent')` (stale 300 s / revalidate 6 h / expire 24 h,
  `next.config.mjs`). On publish, unpublish and delete of a page or an
  article, the Pages and Posts hooks purge those tags with `expire: 0`, so
  `[inference]` the next sitemap request reads the change. The hooks'
  `revalidatePath('/sitemap.xml')` stays, but with no cached route entry to
  expire it no longer changes what the route serves. The future-dated
  publish gate (`isFuturePublicationDate`) reads `Date.now()` per request, so
  a scheduled article joins the sitemap on the first request at or after its
  date, without a purge. `noindex` articles are never listed. `lastModified`
  comes from content (`updatedAt`, else the publication date), never from
  the request time.
  **Why the route cache went (#209).**
  `[measured, staging 2026-09-27 and prod 2026-09-28, #209 comments]` after
  a publish, `/sitemap.xml` kept serving an edge `HIT` whose `age` counted
  back to the first read after the deploy. That held for admin-UI and MCP
  writes alike. The hooks logged their revalidation, and runtime logs showed
  no `/sitemap.xml` function invocation. `[inference]` the stale layer was the
  route's cached response, so the earlier `'use cache: remote'` assembly beneath it
  (`getSitemapData`, wave 9) was never reached. Only a redeploy cleared it.
  That scope has been removed. Whether the platform's edge still caches the
  dynamic response is what #209's production check verifies: a post-publish
  read has to reach the function (a `MISS`, or a function log line) and list
  the new URL. The `posts-sitemap`/`pages-sitemap` tags deleted in wave 8
  stay deleted.
- `src/app/robots.ts` — **a recorded policy since 2026-09-27 (#221)**, pinned
  by `robots.test.ts`. One rule set for every crawler:
  `Disallow: /admin$`, `/admin/` and `/api/` — the Payload admin and the JSON
  and POST endpoints serve nothing a search engine should index. The admin
  renders `<meta name="robots" content="noindex, nofollow"/>` — Payload's
  default `admin.meta.robots`, not overridden in `src/payload.config.ts`
  (`[measured, 2026-09-27, local production build]`: `/admin/login` and
  `/admin` both answer 200 with it). `Disallow` is a crawl exclusion, not an
  index guarantee: while `/admin` is disallowed, crawlers never read that
  `noindex`, and a disallowed admin URL linked elsewhere could still be listed
  without content. The trade-off is kept on purpose (#221): there are no
  public links to admin URLs and crawl budget is the reason for the rule,
  whereas guaranteed deindexing would mean allowing `/admin` so the `noindex`
  is read. **Corrected 2026-09-27:** this paragraph earlier said guaranteed
  exclusion "would need a crawlable `noindex` response instead, which the
  admin does not emit today (`[measured, 2026-09-27]`: no `noindex` or
  `robots` in the `@payloadcms/next@3.88.0` dist)". Do not rely on it: the
  grep had no hits, but it searched the wrong package; the default lives in
  `payload`, and the rendered admin carries it. `Allow: /api/og/` and
  `/api/media/file/` are carved back out, because generated social cards
  (`og:image`, article JSON-LD `image`) and media bytes are served there.
  Precedence is the longest matching rule (RFC 9309), so the carve-outs
  win for their own subtree only. `/_next/` is **not** disallowed: Google
  renders pages with their JS and CSS, and a chunk showing up in Search
  Console's "crawled, not indexed" bucket is noise, not a defect. The
  patterns end in `/` (or `$`) so a prefix never blocks a page such as
  `/administration`. _Superseded 2026-09-27, kept for the trail:_ the
  2026-09-10 (#209) line here read "it allows crawling with no `Disallow` at
  all" — true of the code then (`[measured, prod robots.txt 2026-09-09]`), no
  longer of this tree.
- `/feed.xml` — RSS via `feed` from published posts.
- `/llms.txt` + `/llms-full.txt` — LLM discovery endpoints
  (`src/lib/llms/helpers.ts`): site map summary, and per-article metadata +
  summaries — what they must never carry: `docs/SECURITY.md` § End-user
  authorization (Clerk).

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

- Gated bodies in public payloads and feeds: `docs/SECURITY.md` § End-user
  authorization (Clerk).
- New public routes must be added to the sitemap and, when content-bearing,
  to llms.txt.
- Redirects for retired URLs go through plugin-redirects, not code.
