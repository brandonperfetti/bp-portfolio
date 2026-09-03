# Navigation & routes

Header/footer links come from the `Navigation` and `Footer` globals (Payload),
with hard-coded fallbacks. The command palette mirrors primary nav.

## Route table (`src/app/(frontend)/`)

| Route                                      | Source                        | Notes                                |
| ------------------------------------------ | ----------------------------- | ------------------------------------ |
| `/`                                        | Page global + hard-coded hero | Shader hero + intro + highlights     |
| `/about`                                   | Pages collection (`/about`)   | Sticky portrait rail                 |
| `/articles`                                | Posts (published)             | Explorer: `q`/`topic` + `page`       |
| `/articles/[slug]`                         | Post by slug                  | **URL shape + slugs are a contract** |
| `/projects`                                | Projects collection           | `page`                               |
| `/tech`                                    | TechStack + GitHub signals    | `q`/`category`/`sort` + `page`       |
| `/uses`                                    | Uses collection               | Shares tech viz cards; `page`        |
| `/corvus`                                  | —                             | AI chat surface                      |
| `/thank-you`                               | —                             | Post-contact landing                 |
| `/sign-in`, `/sign-up`, `/account`         | Clerk                         | Render only when Clerk enabled       |
| `/next/preview`, `/next/exit-preview`      | —                             | Draft preview (secret-gated)         |
| `/feed.xml`, `/llms.txt`, `/llms-full.txt` | route handlers                |                                      |
| `/[...segments]`                           | Pages collection by `path`    | Page-builder catch-all — see below   |

## Page hierarchy and the `[...segments]` catch-all (#148)

Any published Pages document whose path is not owned by a dedicated route
renders at `/[...segments]`. A page composes a nested URL by pointing its
`parent` at another page — `/work/brytecore`, `/tech/ai` — with no code and no
deploy per section.

**How a path is built.** Pages carry `parent` (self-referencing, optional) and
a computed `path` (text, indexed, **unique**, admin-read-only). A `beforeChange`
hook stores `path = parent.path + '/' + slug`, or just `slug` for a top-level
page. The catch-all resolves with **one indexed equality read** on `path` —
never a per-request ancestor walk, which at depth 3 would be three sequential
round trips on a route that is supposed to prerender.

**The root-page contract.** The root page is designated by the reserved `home`
slug, named once as `ROOT_PAGE_SLUG` in `src/fields/slug/slugPaths.ts`.
`publicPathFor(collection, doc)` in that module is the **single owner** of the
root → `/` mapping and of every public URL the site emits; no other module
compares a slug to the root slug. Children of the root omit its segment, so a
child of the root serves `/<child>` and not `/home/<child>`. A `rootPage`
pointer on the `site-settings` global was considered and rejected — it would
make the root a _read_, forcing a pure synchronous function called from field
hooks, server renders and unit tests to become async, and `next.config.mjs`
already hard-codes the `/home → /` permanent redirect that a movable root would
outrun. The full reasoning lives on `ROOT_PAGE_SLUG`'s TSDoc.

**Two reservation rules, deliberately not merged.** `RESERVED_PAGE_SLUGS`
(`src/lib/cms/pagesRepo.ts`) is an _emit/serve_ exclusion — a one-segment path a
dedicated route already owns is never served, sitemapped, or statically
generated, though a Pages document there is legitimate and is in fact where
`/about`, `/tech` and friends get their copy. `CODE_OWNED_FIRST_SEGMENTS`
(`src/fields/slug/documentPath.ts`) is the _save-time_ rejection,
for first segments nothing can ever render under. Each set's TSDoc holds the
membership and the reasoning; do not restate them here.

Reserved-ness is a **first-segment rule applying to a one-segment path only**,
which is what lets `/tech/ai` resolve while `/tech` stays the dedicated route's
(Brandon, D1 on #148). Next's static `tech` segment matches the exact path and
never a deeper one, so a reserved page doubles as a usable path anchor for its
children.

**What a save rejects.** `validatePageHierarchy` (`beforeValidate`) refuses a
placement that could not be served — cycles, over-deep paths, code-owned first
segments, and both same- and cross-collection path collisions. Its TSDoc is the
contract, and each rejection carries a message written for the editor who sees
it.

**Renaming a nested page's slug is refused until #150.** The hole is the same
one the Posts side has, arriving through the same door: `createSlugRedirect`
builds a row's `from` from the _slug_, and a slug can only ever spell a
top-level path. Rename `/work/brytecore` to `/work/bcore` and the row written is
`from: /brytecore → /bcore` — two URLs that never existed — while
`/work/brytecore`, the URL that actually moved, gets no row and **404s**. So
`refuseNestedSlugRename` (`src/collections/Pages/hooks/`) rejects a slug rename
on a published page **that has a parent**, and tells the editor to clear the
parent, rename at the top level, and set the parent again. A **top-level** page's
rename is untouched — there `path === slug`, so #120 spells the row correctly
and keeps working byte for byte. It is a stop-gap in its own file, #150 deletes
it, and its TSDoc carries the argument both ways. Re-parenting is not refused,
for the same reason un-placing an article is not: that is an editor deliberately
moving a document, not losing a URL as a side effect of changing something else.

**Known limit.** Moving a parent does **not** cascade to its descendants — pages
or placed posts alike: their stored paths stay stale until they are themselves
saved. Deliberate — the cascade needs the redirect fan-out that extends #120,
and landing one without the other would move a subtree of live URLs with nothing
preserving the old ones (#150).

## Post placement — an article's two possible URLs (#153)

An article has exactly one public URL, and which one depends on a single field.
With no `parent` it is served at `/articles/<slug>`, byte-for-byte the v3 shape,
by `src/app/(frontend)/articles/[slug]`. With a `parent` page it is served at
`/<path>` by the same `[...segments]` catch-all that serves pages, and
`/articles/<slug>` **permanently redirects** there.

**How the catch-all resolves one.** Pages are asked first, by the indexed
equality read on `pages.path`; when none answers, Posts are asked the same way
on `posts.path`. Both can never answer, because the save-time cross-collection
guard rejects the second document to claim a path. The article render is shared
— `ArticleView` in the article route — so the two URLs cannot emit different
JSON-LD, gating or share targets for one document.

**Why the catch-all rather than a rewrite.** A placed article's URL is
structurally a page path; anything else (a `next.config.mjs` rewrite, a route
nested per section) would need the set of section prefixes at build time, and
that is editorial data living in the database.

**The redirect is a check, not a row.** `/articles/[slug]` compares
`publicPathFor(article)` against the only path it can serve and 308s on a
mismatch. It is deliberately not a redirect row: placing an article changes its
`parent`, not its slug, so the #120 machinery writes nothing — and the check
self-heals if a row is ever deleted. `generateStaticParams` keeps emitting
placed slugs so that redirect prerenders as a static 308.

**Two ways a section URL becomes a hard 404 today, both #150's ground.**

- **Un-placing.** Clearing `parent` sets `path` back to NULL, so the article is
  served at `/articles/<slug>` again and the check stops firing. The section URL
  it vacated has no document behind it: the catch-all finds no page and no post
  there, consults the #120 redirect table, finds nothing, and **404s**.
- **Renaming a placed article's slug.** `createSlugRedirect` builds a row's
  `from` from the _slug_, so renaming `/work/old` to `/work/new` writes
  `from: /articles/old → /articles/new` — a pair of archive URLs, for a document
  that lives under `/work`. The URL that actually moved, `/work/old`, gets no
  row and **becomes a hard 404**. **Until #150 lands, renaming a placed post's
  slug breaks its old section URL.**

Neither is a stale shell; both are 404s, and neither is something placement can
close on its own — the fix in both cases is #150's path-aware capture and
redirect writer (`capturePublishedPath` / `createPathRedirect`), which spells a
row's `from` with `publicPathFor` instead of a slug.

Until then the **rename** half is refused rather than allowed to break silently:
`refusePlacedSlugRename` (`src/collections/Posts/hooks/`) rejects a slug rename
on a placed, published article and tells the editor to unplace, rename, and
place again. It is a stop-gap in its own file, and #150 deletes it; its TSDoc
carries the argument both ways. The **un-placing** half is not refused, because
that is an editor deliberately saying "this no longer lives here" rather than
losing a URL as a side effect of changing something else.

**Breadcrumbs.** A placed article's `BreadcrumbList` is its real ancestor chain
(Home → Work → Brytecore → title), derived from `path` in one indexed read. An
unplaced one keeps the archive trail it has always emitted.

## List pagination — the `?page` contract (#88)

All four list surfaces share one param, one primitive
(`src/components/ui/pagination.tsx`) and one set of rules:

- **`?page=N`, absent means page 1.** `page=1` is never written, so the first
  page of any view has exactly one URL — the one that stays canonical
  (`docs/SEO.md`).
- **It composes with the surface's filters** — `q`/`topic` on `/articles`,
  `q`/`category`/`sort` on `/tech` — as an ordinary extra param.
- **Any filter change resets to page 1** by dropping the param. That reset
  happens inside each explorer's existing `updateUrl` mirror, so the
  skip-when-no-URL-change guard still decides whether anything is written.
- **Invalid input clamps to page 1, never 404s.** Non-numeric, zero, negative,
  fractional and out-of-range values all render the first page; the clamp is
  derived at render time and never written back, so a shared link is not
  rewritten under the reader.
- **Filters mirror with `router.replace`; a page change uses `router.push`.**
  Typing must not flood history, but a page change is an explicit navigation —
  the history entry is what makes the back button return the reader to where
  they were. Refresh and share work because the page lives only in the URL, not
  in component state.
- **The control renders only when `total > pageSize`.** Page sizes: `/articles`
  12 (five pages at the current 52-post corpus), `/projects` 24, `/tech` 48,
  `/uses` 48 over the flattened section entries. The last three sit above their
  current corpora on purpose — the same component, no special-casing, no dead
  UI, and the behavior arrives automatically when a collection grows.
- **Every control is a real `<a href>`.** ⌘/Ctrl/middle-click opens a new tab;
  a plain click is intercepted for a client-side navigation. Previous is
  omitted on the first page and Next on the last rather than rendered disabled.
- Reading `page` is client-side only (`useSearchParams`), so each surface
  renders inside a `<Suspense>` boundary and every list route stays `○ Static`.
  Server-side paging is #121.

## Admin & APIs

- `/admin` — Payload admin (own auth).
- `/api/[...slug]`, `/api/graphql` — Payload (generated).
- `/api/mcp` — Payload MCP (API key).
- `/api/ai/chat`, `/api/search`, `/api/contact`, `/api/clerk/webhook`,
  `/api/revalidate` — custom handlers (`src/app/api/`).
