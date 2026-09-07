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
| `/[...segments]`                           | Pages, then Posts, by `path`  | Page-builder catch-all — see below   |

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

**Renaming a nested page's slug is allowed, and preserves the URL that moved
(#150).** It was refused for one release, by a `refuseNestedSlugRename`
stop-gap, because the redirect writer built a row's `from` from the _slug_ and a
slug can only ever spell a top-level path: renaming `/work/brytecore` to
`/work/bcore` wrote `from: /brytecore → /bcore`, two URLs that never existed,
while `/work/brytecore` got no row and 404ed. `createPathRedirect` now keys the
row on the served path, so the row is `/work/brytecore → reference(page)` and
the guard is gone. A **top-level** page's rename is unchanged from #120, byte
for byte — there `path === slug`, so both spellings agree.

**Moving a page moves its subtree.** `cascadePagePaths` recomputes every
descendant page's and placed post's stored `path` inside the same request
transaction, shallowest-first, and purges each URL the move vacated. Inbound
links are covered by **one** prefix redirect row on the moved page rather than
one row per descendant (D4): `/work → /experience` also sends
`/work/brytecore` to `/experience/brytecore`. An exact row always beats the
prefix it sits under.

**The cost, stated rather than discovered.** Each descendant is written through
`payload.update`, which fires that document's own `afterChange` chain —
including `refreshCorvusEmbeddings` for a placed post, whose `sourceUrl`
genuinely changed. So a section rename triggers an embedding refresh
proportional to the subtree size. That is correct behaviour.

### How many moves a URL survives (#178)

**The guarantee: an inbound URL keeps working through as many moves as its
history has rows, up to five hops.** Not "one move" — that was the pre-#178
limit, and it was not a design decision so much as a missing lookup key.

Each redirect row's `to` is a document reference, resolved at read time through
the target's **current** path. That is exactly right for the URL the row is
keyed at, and it is the wrong key for anything captured beneath a prefix row:
the descendant's own row is keyed at the path the descendant had when **it**
moved, and that spelling names the ancestor as the ancestor was named then. So
rewriting a request onto the ancestor's current path lands on a spelling no row
is keyed at, and the descendant's row is never consulted — a request every hop
of which has a row still 404s. [measured, unit probe on the pre-fix tree] the
three-move `lab-parent`/`lab-child`/`lab-grandchild` repro answered
`/lab-base/lab-kid/lab-grandchild`, a path nothing serves.

So every row also stores `toPathAtCapture`: the path its target was being
served at when the row was written. `resolveRedirect` rewrites the remainder
onto **that** path first, re-resolves the result through the same table, and
repeats. Each hop is one historical move, and the walk ends when nothing is
keyed at the rewritten form.

Three limits, stated rather than discovered:

- **Five hops** (`MAX_REDIRECT_HOPS`). A longer chain, or a cycle, answers no
  redirect at all rather than a half-walked guess. No extra database reads —
  every hop re-walks the same in-memory row list, which is still the one 500-row
  read, now traversed up to five times.
- **Rows written before #178 still survive exactly one move, and cannot be
  backfilled.** Such a row has no snapshot, so the reader falls back to the
  current path — the pre-#178 behaviour byte for byte. The path its target was
  served at on the day it was written is not recorded anywhere, so nothing can
  reconstruct it.
- **The snapshot is a PATH, not a reference**, deliberately: its whole job is to
  name a URL that is no longer served, which no live reference can do. The
  consequence is that a spelling re-used later by a different document could in
  principle be hopped onto — a page deleted and its slug taken by another. Rows
  are immutable and destinations are still document references, so the answer
  stays a real document's current URL; it may just be the wrong document's.
  Not observed; recorded here because the reader cannot detect it.

**Permanence now collapses to the chain's product.** A 301 row whose walk passes
through a 302 row answers 307, not 308 — `permanent && next.permanent`. This is
the conservative direction (a 302 is an editor saying the destination is not
settled, and a 308 is cached indefinitely), but it is a real behaviour change
and the alternative — reporting the FIRST row's permanence, since that is the
row whose URL the visitor asked for — is defensible. Open for Brandon.

**The rejected alternative: [cascade rows].** On every move, rewrite the
existing rows that point into the moved subtree, so each row's key stays current
and one lookup always suffices. It was rejected twice over: it mutates history,
so a row no longer records what happened, and it makes each move cost O(rows
touching the subtree) writes inside the editor's publish transaction — the
per-descendant cost D4 chose one prefix row to avoid, arriving by a different
door and pushing at the same 500-row ceiling.

## The `/work` section (#137)

`/work` and `/work/<slug>` are **ordinary hierarchy Pages** — a `work` page with
one child per role — not a route over the `work-history` collection. There is
nothing route-specific to build: the catch-all above resolves them, the sitemap
lists them at their full nested path, the canonical is built from the resolved
document, and the JSON-LD `BreadcrumbList` reflects the real ancestor chain, all
by the same machinery every other nested page uses.

Two pieces make a role page carry the _facts_ rather than a retyped copy of
them:

- The **`workHistoryCard` block gains an optional `entry`** relationship
  (#137). With `entry` empty it renders the whole résumé card, exactly as it did
  before; with `entry` set it renders that one role's company, title, period,
  logo and (optionally) description, read from the `work-history` row. One
  block, one mode field — not a second near-identical block in the picker.
- **`work-history` rows carry a `unique` slug**, and Corvus composes
  `/work/<slug>` from it (`sourceUrlFor`), so a work-history answer cites a page
  a visitor can actually open instead of the homepage. The slug routes nothing
  by itself — `work-history` is deliberately absent from
  `SLUG_ROUTED_COLLECTIONS`.

The role Page's slug and the `work-history` row's slug are expected to match by
editorial convention; nothing enforces it, because the citation is composed from
the row and the page is resolved from its own `path`.

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

**Two ways a section URL used to become a hard 404, both closed by #150.**

- **Un-placing.** Clearing `parent` sets `path` back to NULL, so the article is
  served at `/articles/<slug>` again and the check stops firing. The section URL
  it vacated had no document behind it and no row spelled that way, so the
  catch-all 404ed. It now gets a row: `from: /work/<slug> → reference(post)`,
  resolving to `/articles/<slug>`, and the vacated path is purged so the row is
  actually consulted.
- **Renaming a placed article's slug.** The row used to be
  `from: /articles/old → /articles/new` — a pair of archive URLs, for a document
  living under `/work` — while `/work/old` got no row at all. It is now
  `/work/old → reference(post)`.

Neither needed a new branch. `createPathRedirect` builds `from` with
`publicPathFor` from the path the document was being served at, and both cases
are simply "the served path moved" — which is also why un-placing, whose slug
never changes, was invisible to the slug-keyed writer.

**Breadcrumbs.** A placed article's `BreadcrumbList` is its real ancestor chain
(Home → Work → Brytecore → title), derived from `path` in one indexed read. An
unplaced one keeps the archive trail it has always emitted.

## Topic section homes and the `/articles` affordance (#151, #154)

A topic (`categories` row) may point at a Page that is its home. Article topic
chips then link there; a topic without one stays a pure filter.

**On `/articles` the filter chips still never navigate.** They are state
toggles that mirror `?topic=` through `router.replace`, which is what keeps the
route statically rendered. Instead, when **exactly one** filter is active and
that filter names a category with a _published_ home, the filter row offers a
separate `View the ⟨X⟩ section →` link (a real `<Link>`, arrow `aria-hidden`,
rendered last in the card so it never interrupts the chip run in the tab
order). A tag, a homeless category and `All` all render nothing — silently, with
no empty state.

The lookup is client-side over a `Record<lowercased category title, path>` the
server page resolves once via `getTopicSectionPaths` and passes down, so no
`searchParams` are read on the server and `/articles` stays `○ Static`.

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
