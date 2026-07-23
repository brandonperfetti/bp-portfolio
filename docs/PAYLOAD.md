# Payload CMS

Payload is the single source of truth for site content. Admin at `/admin`
(Payload's own Users auth — Clerk never guards the admin).

## Collections

- **Posts** — articles (`/articles/[slug]`). Drafts + versions + autosave
  (100ms) + scheduled publish. Tabs: Content (excerpt, heroImage, Lexical
  content), Meta (relatedPosts, categories, tags), SEO (plugin-seo fields).
  `access` group carries the gating model (`visibility`, dormant
  `requiredPlan`/`requiredFeature`). Hooks: `publishedAt` autofill,
  `populateAuthors`, `revalidatePost`.
  **Editor features must keep every node type the Notion migration emitted
  registered** — lists (ordered/unordered/check), blockquote, upload — plus
  blocks Banner/Code/MediaBlock. Removing one crashes every migrated article
  with minified Lexical error #17. Posts also carry an optional
  `layout` blocks field (the shared block library) rendered **below** the
  article body by `<CmsPostBlocks slug="…" />` — per-article CTAs, newsletter
  signups, FAQ sections. (Above-article is intentionally not offered: the
  hero/title own that space.)
- **Pages** — block-composed pages resolved by path. The block library lives
  in `src/blocks/library.ts` (`pageBuilderBlocks`) — one alphabetical list
  registered by every layout-capable surface (Pages + Posts), keeping the
  admin picker, `RenderBlocks`, and Storybook a 1:1 set. **Page builder:**
  any published page whose slug isn't owned by a dedicated route renders at
  `/[slug]` via `RenderHero` + `RenderBlocks` — compose new pages entirely
  in admin, no code or deploy. Reserved slugs live in
  `src/app/(frontend)/[slug]/page.tsx`. **Hybrid routes:** the seven
  code-owned routes also render their Pages doc's layout via
  `<CmsPageBlocks slug="…" />` (spacer-only layouts are treated as empty),
  so admin-composed sections can be appended to bespoke pages too.
  **PhotoStrip special case:** the home route consumes its Pages doc's first
  `photoStrip` block for the hero-slot gallery (via
  `photoStripImagesFromLayout` in `pagesRepo`) and excludes `photoStrip`
  from its end-of-page region (`<CmsPageBlocks slug="home"
exclude={['photoStrip']} />`) so it never renders twice — editing that
  block in admin swaps the home gallery in place.
- **Projects**, **TechStack** (name/category/proficiency/logo/url/githubRepo),
  **Uses** (category-grouped tools), **Categories**, **Tags**, **Media**
  (Blob-backed), **Users** (admin operators).

## Globals

`SiteSettings` (canonical URL, metadata defaults), `Navigation`, `Footer`,
`Identity` (author/JSON-LD identity + the uploaded CV: `getCmsIdentity`
feeds `buildPersonSchema` and the Resume card's Download CV button; empty
fields fall back to the `src/lib/identity.ts` constants and the static
`/assets` PDF).

## Slugs

Classic pattern in `src/fields/slug/`: text field + `slugLock` checkbox +
`formatSlug` hook + admin component. Migrated slugs are locked — unlock in
admin to change (URL contract: never rename published article slugs).

## Plugins (`src/plugins/index.ts`)

- `plugin-seo` — meta title/description/image + previews; `generateTitle` is
  `{title} - Brandon Perfetti`; posts URL-prefix `/articles`.
- `plugin-redirects` — editorial redirects, revalidated on change.
- `plugin-search` — synced search index over posts feeding `/api/search`.
- `plugin-mcp` — Payload MCP endpoint at `/api/mcp` (API-key auth) so agents
  can operate the CMS. Collections opt in with `{ enabled: true }` objects.

## Generated artifacts (committed + CI-gated)

- `src/payload-types.ts` ← `pnpm generate:types`
- `src/app/(payload)/admin/importMap.js` ← `pnpm generate:importmap`

Run both after any schema/field/plugin change; CI diffs them and fails on
staleness. A stale importMap manifests as missing admin UI (empty SEO tab,
unrenderable editor).

## Migrations

- `pnpm migrate:create` after schema changes → commit the migration.
- Vercel build runs `pnpm migrate && pnpm build` (`vercel.json`).
- `scripts/migrate-notion-to-payload.ts` was the one-time Notion→Payload
  content migration (upsert-by-slug, drafts, covers→Blob). Keep for
  reference; DRY_RUN/ONLY_SLUG knobs. Note: `payload run` kills floating
  promises at module-eval end — scripts must top-level `await`.
- `scripts/set-admin-password.ts` — Local API admin bootstrap/password reset.
