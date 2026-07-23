# Content workflow

## The split (locked decision)

- **Notion = planning only**: drafting ideas, outlines, editorial calendar.
  No runtime integration, no sync jobs, no webhooks. Never rebuild them.
- **Payload = the CMS**: writing, editing, publishing, SEO, media.

## Publishing flow

1. Draft in `/admin` → Posts (autosave + versions are on).
2. Fill SEO tab (plugin-seo checks) and Meta tab (categories/tags).
3. Publish (or schedule) — `revalidatePost` makes it live on
   `/articles/[slug]` immediately; search index and sitemap update via
   plugin-search sync + tag revalidation.
4. Slugs lock after creation (`slugLock`). Changing a published slug breaks
   the URL contract — add a redirect via plugin-redirects if truly needed.

## Draft preview

Admin Live Preview / Preview buttons hit `/next/preview` (secret:
`PREVIEW_SECRET`) and render draft content; `/next/exit-preview` clears.

## Migration provenance

The v3 archive was migrated from Notion by
`scripts/migrate-notion-to-payload.ts` (one-time): slugs preserved and
locked, bodies converted to Lexical, covers uploaded to Blob, everything
landed as drafts for review-then-publish. `scripts/fix-migrated-posts.ts`
audited node counts and backfilled authors. Both stay for reference; they
are not part of any recurring workflow.

## Payload MCP

`/api/mcp` (plugin-mcp, API-key auth) lets agents CRUD content
programmatically — the supported automation path now that Notion sync is
gone.
