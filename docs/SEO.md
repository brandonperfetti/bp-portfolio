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

`src/lib/articleMetadata.ts` provides `createArticleMetadata()` used by article pages to set:

- per-article title/description
- published time
- optional OG/Twitter image

## Indexing Routes

- `src/app/sitemap.ts`:
  - emits static routes
  - appends article routes from provider facade (`local` fallback mode or `notion` CMS)
- `src/app/robots.ts`:
  - robots directives
- `src/app/feed.xml/route.ts`:
  - RSS feed endpoint metadata

## Best Practices

- Keep article `description` concise and unique.
- Ensure article `date` is valid ISO-compatible format.
- Ensure article/social image fields are populated in the active content provider when social card richness is important.
