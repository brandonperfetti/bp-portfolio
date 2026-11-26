# Glossary

Domain terms as this repo uses them, one line each. Use these words in issues,
reviews, test names and proposals, and don't drift to synonyms. How the
engineering skills read this file: `docs/agents/domain.md`.

## CMS

Seeded for the CMS Domain Agent (`docs/agents/cms-domain.md`, #383). Details
live in `docs/PAYLOAD.md`.

- **Collection**: a Payload document type with many rows, defined under
  `src/collections/` (Posts, Pages, Projects, …).
- **Global**: a Payload singleton document, defined under `src/globals/`
  (SiteSettings, Navigation, Footer, Identity, CookieConsent).
- **Block**: one entry of the shared layout block library
  (`src/blocks/library.ts`), composed into a Page's or Post's `layout` field.
- **Repo module**: a `src/lib/cms/*Repo.ts` reader that wraps the Local API in
  a `'use cache'` scope with revalidation tags and maps Payload docs to the
  `Cms*` shapes pages consume.
- **Local API**: Payload's in-process API (`payload.find`, `payload.update`,
  …) used by repo modules, scripts, seeds, tests and MCP writes, with traps of
  its own (`docs/PAYLOAD.md` § Local API gotchas).
- **Migration**: a committed file under `src/migrations/`, made by
  `pnpm migrate:create`, that every schema change ships with.
- **Companion tables (`_v`, `_rels`)**: the extra tables Payload makes for a
  versioned collection (`_v`) and for a `hasMany` or polymorphic relationship
  (`_rels`); a new one needs RLS in the same migration as its parent table.
- **Draft**: an unpublished version (`_status: 'draft'`) of a collection with
  versions enabled; a Local-API `draft: true` never reaches `req.query`.
- **Revalidation tag**: a `CMS_TAGS` string (`src/lib/cms/cache.ts`) that repo
  modules cache under and hooks purge with `revalidateTag(tag, { expire: 0 })`.
- **Slug lock**: the `slugLock` checkbox; set, it means "I do not hand-edit
  this slug". The admin form then follows the title until first publish (a
  REST or MCP title-only write keeps the stored slug), and on Posts and Pages a
  published slug is frozen (`docs/PAYLOAD.md` § Slugs and paths).
- **Public path**: a document's public URL as `publicPathFor` computes it
  (`src/fields/slug/slugPaths.ts`), the one owner of that answer.
- **Placed post**: a Post given a parent Page, served at `/<path>` through the
  catch-all, with `/articles/<slug>` redirecting there (`docs/NAVIGATION.md`).
