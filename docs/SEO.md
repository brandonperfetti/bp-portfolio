# SEO and Metadata

## Global Metadata

Defined in `src/app/layout.tsx`:

- site title template
- description
- canonical base
- Open Graph defaults
- Twitter card defaults

`NEXT_PUBLIC_SITE_URL` is used to derive canonical and metadata base URLs.

## Article Metadata

`src/app/articles/[slug]/page.tsx` (`generateMetadata`) sets:

- per-article title/description
- canonical URL
- robots directives (`noindex` support)
- published time
- optional OG/Twitter image
- keyword set derived from CMS `keywords/topics/tech`

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
- Ensure article `date` is valid ISO-compatible format.
- Ensure article/social image fields are populated in the active content provider when social card richness is important.
