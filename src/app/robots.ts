import { type MetadataRoute } from 'next'

import { getSiteUrl } from '@/lib/site'

/**
 * Paths a crawler is told to skip (#221): the Payload admin and the `/api`
 * surface.
 *
 * @remarks Neither serves anything a search engine should index — the admin is
 * a login-gated app shell, and `/api` is JSON and POST endpoints: the Payload
 * REST surface, `/api/mcp`, `/api/ai/*`, `/api/search`, `/api/contact`. Crawl
 * budget on a low-authority domain is finite, and every fetch spent there is
 * one not spent on an article.
 *
 * **The admin does carry `noindex` (corrected 2026-09-27).** It renders
 * `<meta name="robots" content="noindex, nofollow"/>` — Payload's default
 * `admin.meta.robots` (`payload/dist/config/defaults.js`), which
 * `src/payload.config.ts` does not override.
 * `[measured, 2026-09-27, local production build]` on both `/admin/login`
 * and `/admin` under `next start`, each answering 200. Two earlier lines here
 * said the opposite; do not rely on them. The first read "Payload's admin
 * metadata carries no `noindex`, so robots is the only signal it gets",
 * backed by a grep of the wrong package
 * (`@payloadcms/next` holds no admin robots default; `payload` does). The
 * second read "guaranteed exclusion would need a crawlable `noindex` response
 * instead, which the admin does not emit today". The observation was a grep
 * with no hits; the conclusion drawn from it was wrong.
 *
 * `Disallow` is a crawl exclusion, not an index guarantee: while `/admin` is
 * disallowed, crawlers cannot fetch it and so never read that `noindex`, and
 * a disallowed admin URL linked elsewhere could still be listed without
 * content. The trade-off is kept on purpose (#221): there are no public links
 * to admin URLs and crawl budget is the reason for the rule, whereas
 * guaranteed deindexing would mean allowing `/admin` so the `noindex` is read.
 *
 * Spelled so a prefix never swallows a page. `/admin$` + `/admin/` rather than
 * a bare `/admin`, and `/api/` rather than `/api`, because robots rules are
 * prefix matches: a bare `/admin` would also block a CMS page at
 * `/administration`, which the `[...segments]` catch-all would happily serve.
 * `$` (end-of-path) is RFC 9309 syntax, honoured by Google and Bing; a crawler
 * that ignores it still reaches only `/admin` itself, which answers 200 with
 * the same `noindex, nofollow` meta (`[measured, 2026-09-27, local]`; an
 * earlier line here said it "redirects into the blocked `/admin/` tree", which
 * was never measured and is not what the local build does).
 *
 * `/_next/` is deliberately NOT here. Google renders pages with their JS and
 * CSS, and a blocked chunk is a page that renders wrong at index time — a
 * worse outcome than one chunk URL in Search Console's "crawled, not indexed"
 * bucket, which is noise, not a defect (#210 q3).
 */
const DISALLOWED_PATHS = ['/admin$', '/admin/', '/api/']

/**
 * The public media routes under `/api`, carved back out of the `/api/` block
 * (#221).
 *
 * @remarks Robots precedence is the **longest matching rule** (RFC 9309, and
 * Google's documented order), so these `Allow`s win over `Disallow: /api/`
 * for their own subtree only.
 *
 * - `/api/og/` — the generated social cards. An article or page that resolves
 *   to a generated card emits it as `og:image`, and an article also as its
 *   JSON-LD `image` (`articles/[slug]/ArticleView.tsx`,
 *   `resolvePageSocialImage` in `src/lib/cms/pageMetadata.ts`). Blocking it
 *   would stop Googlebot fetching the image a rich result shows, and a card
 *   crawler that honours robots would render the link preview with no
 *   image. Twitterbot honours it: [stated, X developer docs, "Troubleshooting
 *   Cards"; not re-read, the page answered HTTP 402 to a fetch on
 *   2026-09-27].
 * - `/api/media/file/` — Payload's own media route. Production emits the
 *   public Blob origin as `media.url` (`src/lib/storage/mediaBlobUrl.ts`), so
 *   this is the fallback spelling rather than the live one — but it is where
 *   media bytes are served from whenever no Blob origin resolves, and images are
 *   indexable content. Allowing it costs nothing; blocking it would be the
 *   hard-to-undo mistake.
 */
const ALLOWED_API_PATHS = ['/api/og/', '/api/media/file/']

/**
 * The `/robots.txt` route: one rule set for every crawler, plus the sitemap.
 *
 * @remarks The policy is a recorded decision, not a default (#221) — see
 * {@link DISALLOWED_PATHS} and {@link ALLOWED_API_PATHS} for the reasoning and
 * `robots.test.ts` for the pinned output. Crawl and index controls live in
 * robots directives; AI-discovery files (e.g. `llms.txt`) are informational,
 * not enforcement mechanisms.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()

  return {
    rules: {
      userAgent: '*',
      allow: ['/', ...ALLOWED_API_PATHS],
      disallow: DISALLOWED_PATHS,
    },
    host: siteUrl,
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
