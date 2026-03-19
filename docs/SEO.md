# SEO and Metadata

## Global Metadata

Defined in `src/app/layout.tsx`:

- site title template
- description
- canonical base
- Open Graph defaults
- Twitter card defaults

Canonical base URLs should come from CMS site settings (`canonicalUrl`) when
available, with `NEXT_PUBLIC_SITE_URL` as the fallback.

## Article Metadata

`src/app/articles/[slug]/page.tsx` (`generateMetadata`) sets:

- per-article title/description
  - title precedence: `SEO Title` -> article `title`
  - description precedence: `SEO Description` -> article `description`
  - article pages use an absolute page title to avoid inheriting the global
    `%s - SiteName` title template
- canonical URL
- robots directives (`noindex` support)
- published time
- optional OG/Twitter image
- keyword set derived from CMS `keywords/topics/tech`
- JSON-LD:
  - `Article`
  - `BreadcrumbList`

## Non-Article Structured Data

- `src/app/page.tsx`:
  - `WebSite` (with `SearchAction`)
  - `Person`
- `src/app/about/page.tsx`:
  - `AboutPage`
  - `Person`
  - `BreadcrumbList`
- `src/app/articles/page.tsx`:
  - `CollectionPage`
  - `BreadcrumbList`
  - `ItemList`
- `src/app/projects/page.tsx`:
  - `CollectionPage`
  - `BreadcrumbList`
  - `ItemList`

Shared structured-data helpers:

- `src/lib/seo/jsonLd.ts` (`toSafeJsonLd`)
- `src/lib/seo/structuredData.ts` (`buildPersonSchema`)

## Indexing Routes

- `src/app/sitemap.ts`:
  - emits static routes
  - appends public article routes from provider facade (`local` fallback mode or `notion` CMS)
  - excludes `noindex` and future-dated articles
  - sets `/articles` `lastModified` from newest public article freshness
- `src/app/robots.ts`:
  - robots directives
- `src/app/feed.xml/route.ts`:
  - RSS feed endpoint metadata
  - excludes `noindex` and future-dated articles
- `src/app/llms.txt/route.ts`:
  - experimental AI-discovery endpoint
  - includes canonical site links and recent public article URLs
  - references `/llms-full.txt` for expanded corpus context
  - excludes `noindex` and future-dated articles
- `src/app/llms-full.txt/route.ts`:
  - expanded AI-discovery corpus endpoint
  - includes richer per-article metadata (published/updated/topics/keywords/tech)
  - excludes `noindex` and future-dated articles

## Best Practices

- Keep article `description` concise and unique.
- Keep `SEO Title` within 45-65 characters.
- Keep `SEO Description` within 120-160 characters.
- Ensure article `date` is valid ISO-compatible format.
- Ensure article/social image fields are populated in the active content provider when social card richness is important.
