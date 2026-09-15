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
repeats. The walk ends when nothing is keyed at the rewritten form, and when it
ends that way the answer is a rewrite onto the target's **current** path, not
the capture-time spelling.

**[Amended 2026-09-09, #201.]** "The target" in that last sentence used to mean
the row's `to`, and now means the document the row was **captured for**, read
from `toIdAtCapture`. The two are the same document — and therefore the same
string — for every row but one shape: a row whose captured path was later
re-used, which `createPathRedirect` repoints at the new occupant while the
snapshot still names the old one's era. See the fourth bullet below.

**A hop is not a move.** Budget is spent only when a prefix row carrying a
snapshot rewrites a request onto a spelling that differs from the one asked for.
A row matched exactly costs nothing, and the last row in a walk costs nothing —
so the repro above is **three moves and one hop**. Read the number below as a
floor, not a ceiling: five hops buys _at least_ five chained ancestor moves, and
usually more.

Four properties of the walk, stated rather than discovered. The fourth was a
shipped limit until **#201** closed it; it is left in place, marked, because the
reasoning that made it a limit is what the fix had to answer.

- **Five hops** (`MAX_REDIRECT_HOPS`). A longer chain, or a cycle, answers no
  redirect at all rather than a half-walked guess. No extra database reads —
  every hop re-walks the same in-memory row list, which is still the one 500-row
  read, traversed up to six times (the initial pass plus five hops).
- **A hop that finds nothing falls back; it never serves the snapshot.** Under a
  complete table the two are the same string — if the target had moved since
  capture there would be a row keyed at the snapshot and the hop would have
  matched it. Under an incomplete one they differ, and the snapshot is the worse
  answer: a spelling that was current in the past and may serve nothing today.
  The table can be incomplete two ways, both reachable — an editor deletes an
  intermediate row (the redirects collection is fully editable in admin), or the
  row falls outside the 500-row read. Serving the stale form there would answer
  a **301 to a dead URL** where the pre-#178 code answered the live one, so the
  resolver falls through to the current-path rewrite instead. **[Amended
  2026-09-09, #201:** that fall-through is now onto the **captured document's**
  current path rather than the row's current destination, which is the same
  string except on a repointed row — and on a repointed row whose captured
  document has been deleted or unpublished there is no such path, so the walk
  ends in a **terminal `null`**: a 404, deliberately, rather than handing the
  subtree to whoever holds the path now. A 404 is visible and gets reported; a
  plausible wrong page is not.**]**
- **Rows written before #178 still survive exactly one move, and are not
  backfilled.** Such a row has no snapshot, so the reader falls back to the
  current path — the pre-#178 behaviour byte for byte. The reason not to backfill
  is unreliability, not absence: `path` is a stored field, so `_pages_v` does
  hold historical paths and a `createdAt`-bounded migration could reconstruct
  some of them. But `versions.maxPerDoc: 50` under a 100 ms autosave interval
  burns fifty versions in a few seconds of editing, so history rarely reaches
  back to an old rename. Such a backfill would leave most rows NULL and silently
  fill some **wrongly** — and a NULL degrades to exactly the pre-#178 behaviour
  while a wrong snapshot sends a walk down a wrong branch, indistinguishable
  from a right one.
- **The snapshot is a PATH, not a reference**, deliberately: its whole job is to
  name a URL that is no longer served, which no live reference can do. The
  consequence was a path collision: a spelling vacated by one document and later
  re-used by another could be hopped onto, so `/old-a/leaf` answered a permanent
  redirect into an unrelated document's subtree — a real document's current URL,
  just the wrong document's, with the resolver unable to detect the
  substitution.

  **[Closed 2026-09-09 by #201. What follows is the paragraph as it stood, and
  why its objection no longer holds — the objection was right about the guard it
  described, and that is not the guard that shipped.]** This was shipped as a
  known limit on two grounds: the precondition is compound (a path vacated _and_
  re-occupied by a different document _and_ that document then moved, with a
  live prefix row still keyed at the vacated spelling), and the pre-#178 answer
  for the same request was a rewrite onto a path that served nothing either. The
  stated reason not to fix it was that **the obvious guard does not work** —
  snapshotting the target's id and "rejecting a next-hop row that names a
  different document" rejects the correct case just as readily, because in the
  three-move repro row A's target is the child while the row matched at A's
  capture path is the **grandchild's**, a different document by design.

  That objection is about a filter on the candidate row's **target**, applied to
  every candidate. #201 filters on the candidate's **capture identity**, and
  only for a candidate keyed **exactly at the capture base**. The grandchild's
  row survives both halves: it is keyed at `/lab-parent/lab-kid/lab-grandchild`,
  a strict descendant of row A's capture base `/lab-parent/lab-kid`, so it is
  never a candidate for the filter at all. A row keyed exactly at the capture
  base is the only row that makes a claim about **who held that path**, and if
  its capture identity is a different document then it belongs to a later
  occupant. Ancestor-lineage identity is still not recorded and is still not
  needed. **The instruction that used to close this bullet — "do not file the
  id-snapshot follow-up as written" — is therefore retired**; the follow-up was
  filed as #201 and shipped, and it is the filter's shape, not the id, that the
  objection turned on. Four tests in `redirectsRepo.test.ts` pin the four
  outcomes:

  - the three-move lineage still resolves with identities recorded, in all three
    list orders (the grandchild's row is still reached);
  - the collision no longer hops into the later occupant's row (red before the
    fix);
  - a row keyed at the capture base whose identity is the **same** document is
    still hopped through;
  - a row keyed there that records **no** identity is still hopped through, so
    the filter cannot fire on a pre-#201 row.

  Two things the fix deliberately does **not** do. It does not anchor the
  **exact** key: `/old-a` itself, once both documents have vacated it, still
  resolves to the new occupant, because `from` is unique and #120's rule is that
  the last document to leave a path keeps that path's redirect — anchoring is
  scoped to the subtree, whose only key is the snapshot. And it does not
  backfill: a row written before #201 has no identity, cannot gain a truthful
  one, and keeps the behaviour described above, collision included.

**Permanence now collapses to the chain's product.** A 301 row whose walk passes
through a 302 row answers 307, not 308 — `permanent && next.permanent`.

**Decided: keep the chain's product.** The alternative — report the FIRST row's
permanence, since that is the row whose URL the visitor asked for — is
defensible, and it loses on the asymmetry of harm. A wrong 307 costs a ranking
signal, is recoverable, and self-heals: the day the 302 becomes a 301 the
composite becomes 308 and equity consolidates with no intervention. A wrong 308
is cached by browsers effectively indefinitely (Chrome holds it until the user
clears site data), the server can never retract it, and a visitor whose browser
learned the pair keeps following it after the destination is retired. One is a
temporary loss of a signal; the other is a permanent loss of a visitor that no
deploy can fix. Two supporting reasons: the frequency is low by construction —
`createPathRedirect` hard-codes `type: '301'` on every row it writes, so a 302
enters a chain only when an editor deliberately writes one — and the decision is
reversible in the direction that matters, since the first-row rule could be
adopted later with no data change while a fleet of wrongly-cached 308s could
not be undone at all. The rule is stated in the redirect-type field's admin
description, because the editor writing the 302 is the person who causes it and
nothing on the downgraded row shows what happened.

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
