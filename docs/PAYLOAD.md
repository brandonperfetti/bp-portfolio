# Payload CMS

Payload is the single source of truth for site content. Admin at `/admin`
(Payload's own Users auth — Clerk never guards the admin).

## Collections

- **Pages** — layout-builder pages served by the `/[...segments]` catch-all,
  resolved on a computed, unique, indexed `path`. See "Slugs and paths" below
  and `docs/NAVIGATION.md` for the hierarchy, the root-page contract and the
  reserved-first-segment rule.
- **Posts** — articles (`/articles/[slug]`, and `/<path>` through the
  `/[...segments]` catch-all once an article is _placed_ under a parent page —
  see `docs/NAVIGATION.md`, #153). Drafts + versions + autosave
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
  any published page whose path isn't owned by a dedicated route renders at
  `/[...segments]` via `RenderHero` + `RenderBlocks`, resolved on the computed,
  unique, indexed `path` — compose new pages entirely in admin, no code or
  deploy, at any depth up to `PATH_MAX_DEPTH`. Two reservation sets guard that,
  and they are deliberately different (#148): `RESERVED_PAGE_SLUGS`
  (`src/lib/cms/pagesRepo.ts`) is the _emit/serve_ exclusion for one-segment
  paths a dedicated route already owns, and `CODE_OWNED_FIRST_SEGMENTS`
  (`src/fields/slug/documentPath.ts`) is the _save-time_ rejection for first
  segments nothing can ever render under. Each set's TSDoc holds the membership
  and the reasoning. **Hybrid routes:** five code-owned
  content routes — `/articles`, `/tech`, `/projects`, `/corvus`, `/uses` —
  also render their Pages doc's layout via `<CmsPageBlocks slug="…" />`
  (spacer-only layouts are treated as empty), so admin-composed sections can
  be appended to bespoke pages too. (`/` and `/about` instead render their
  whole Pages doc through the shared `RenderRhythmPage` seam — see below —
  and so are not in this set.)
  **Home (`/`):** since #42 the home route renders its Pages doc through the
  shared page-builder seam `src/heros/RenderRhythmPage.tsx` — the same
  draft-aware renderer the `/[...segments]` catch-all uses — so `photoStrip` is a
  normal layout block rendered inline by `RenderBlocks`, editable in admin like
  any other. The old hybrid mechanism (`photoStripImagesFromLayout` in
  `pagesRepo`, `<CmsPageBlocks slug="home" exclude={['photoStrip']} />`) is
  retired: there is no hero-slot gallery extraction and no exclusion.
- **Projects**, **TechStack** (name/category/proficiency/logo/url/githubRepo),
  **Uses** (category-grouped tools), **Categories**, **Tags**, **Media**
  (Blob-backed), **Users** (admin operators).
- **`postRollup`** (#152) is the block a section or topic landing page uses to
  show _its_ articles rather than the site's newest ones. `source` is
  `by-category` (published posts carrying the chosen topic — the one that works
  on day one) or `by-placement` (posts whose `parent` is the chosen page, #153).
  **A `by-placement` rollup with an empty `page` picker rolls up the hosting
  page's own placed articles** (#177) — #152's design, buildable once
  `RenderBlocks` began carrying the hosting document's collection and id
  (`BlockHostDocument` in `src/blocks/hostContext.ts`, threaded as a prop from
  `RenderRhythmPage` / `CmsPageBlocks` / `CmsPostBlocks`, never a `headers()`
  read, so a page carrying one stays prerenderable). A chosen page always
  overrides. **On a Post host the empty picker renders nothing**, because "the
  posts placed under the page this block is on" has no meaning under a post;
  a rollup on an article must pick a page explicitly.
  Its `grid` and `stacked` layouts render through `ArticlesArchiveView`, so
  there is one card vocabulary on the site; `compact-list` is its own dense,
  dated `<ul>`. Every select carries an explicit `enumName`
  (`enum_post_rollup_source` / `_sort` / `_layout`) for the reason
  `ArticlesArchive/config.ts` records — the block nests three levels deep and
  the generated identifier crowds Postgres's 63-character limit. An empty
  result, or an unset relationship, renders `null`.
- **Categories** carries an optional `sectionPage` relationship — "this topic
  has a home, and it's this Page" (#151). Opt-in by design: a topic without one
  stays a pure filter, and an unpublished or deleted target falls back to
  `/articles?topic=<title>` rather than linking at a 404 (`resolveTopicHref`,
  `src/lib/cms/topics.ts`). **It created no join table, and so needs no new RLS
  line** — a fact worth stating because the ticket that added it expected the
  opposite. Payload's Postgres adapter materialises a `_rels` table only for a
  relationship that is `hasMany` or polymorphic; `sectionPage` is single-valued
  and targets one collection, so it lands as `categories.section_page_id` with
  an index, like every other 1:1 relationship in this schema. `categories`
  itself pre-dates the #72 lockdown and already carries RLS, which adding a
  column cannot weaken — RLS is a table property, not a column one. The
  convention is unchanged for the next `hasMany` or polymorphic relationship on
  this collection: that one **does** create `categories_rels` and **does** owe
  the line in its own migration — see §"New-table RLS convention (#72)".
- **WorkHistory** carries a `unique` slug (#137) — an addressing key, not a
  route; see §"Slug freeze" below.

**Cleared hero text is stored as `NULL`, never as an empty Lexical root
(#164).** A rich-text value whose `root.children` is `[]` is the one shape
Lexical refuses to load — `setEditorState` throws error #38 — so the admin
renders "Something went wrong: Minified Lexical error #38" in place of the
editor and the field can only be fixed by a DB write. The hero group's
`beforeChange` normaliser (`normalizeHeroByType`, `src/heros/`) therefore maps
an empty root to `null` on every save, for every hero type, on top of the
type-based clearing it already does; the predicate lives in
`src/lib/content/lexicalEmptyRoot.ts`. This applies to every collection that
mounts the shared `hero` group. Readers already tolerate `null` (a cleared hero
renders nothing), so `null` is the canonical stored form for "no hero text".

**Categories is labelled "Topics" in the admin — the slug stays `categories`
(#149).** The public surface has said "topics" for a long time: the chips on
`/articles`, the `?topic=` query param, `topics: string[]` on the read models.
Only the admin still said "Categories", and `labels: { singular: 'Topic',
plural: 'Topics' }` on the collection (plus `label: 'Topics'` on the Posts
relationship field) closes that gap with a presentation-only change. An actual
collection rename would cost a table migration with data-loss risk, a search
reindex, and renamed `categories` MCP tools that every agent calling them would
break on — and it would change no public string, because none of them say
"categories" today. So the standing rule is: **`categories` is the slug and the
field name; "Topic(s)" is what a human reads.** Code says `post.categories`;
admin, UI and prose say topics.

## Globals

`SiteSettings` (canonical URL, metadata defaults), `Navigation`, `Footer`,
`Identity` (author/JSON-LD identity + the uploaded CV: `getCmsIdentity`
feeds `buildPersonSchema` and the Resume card's Download CV button; empty
fields fall back to the `src/lib/identity.ts` constants and the static
`/assets` PDF).

## Slugs and paths

Pattern in `src/fields/slug/`: text field + `slugLock` checkbox + `formatSlug`
hook + `enforceSlugFreeze` hook + admin component.

**`publicPathFor(collectionSlug, doc)` in `src/fields/slug/slugPaths.ts` is the
single owner of "what is this document's public URL."** Sitemap, canonical,
JSON-LD, RSS, `llms.txt`, `/api/search`, `CMSLink`, the SEO plugin's
`generateURL`, the admin preview builder, the redirect writer/reader and the
revalidation hooks all resolve through it. Never hand-build a public URL; if a
surface needs one, call this. `publicPathForSlug(collection, slug)` is a thin
wrapper for callers holding only a slug — correct for a top-level page and for
an unplaced post, and necessarily wrong for a placed document of either kind.
The admin slug sidebar shows the resolved full public path ("Served at
/work/brytecore") so an editor can see what their edit will move (#120's
lesson, #148's fix).

**Pages carry a hierarchy** (#148): `parent` (self-referencing, optional,
top-level) and a computed, unique, indexed `path`. The root page is designated
by the reserved `home` slug (`ROOT_PAGE_SLUG`) and serves `/`.

**Posts carry an optional placement** (#153): the same two top-level fields,
`parent` (→ pages, single-valued, filtered to published non-root pages) and a
computed, unique, indexed `path`. Placement is **opt-in and defaults to unset**,
and that default is the whole design — M2 writes no backfill, so `path` is NULL
for every post that exists and `publicPathFor` answers `/articles/<slug>`
byte-for-byte. A post only leaves the archive when an editor picks a parent, and
`publicPathFor` then answers `/<path>`. Changing a published post's `parent`
needs **no slug unlock** (Brandon, D5) — it is a deliberate, visible act with an
obvious URL consequence, unlike the silent title-driven re-slug
`enforceSlugFreeze` exists for — and a placed post stays in `/articles`, the
feed and search, with every link pointing at the placed path (D6).

The rules Pages and Posts share — the depth cap, the code-owned first segments,
the parent-path composition and the cross-collection collision guard — live once
in `src/fields/slug/documentPath.ts`, because a page and a placed post compete
for the same URL namespace and a second copy of any of them is a second chance
for both to claim `/work/brytecore`.

The contract lives in the code: field shapes and hook order in
`src/collections/Pages/index.ts` and `src/collections/Posts/index.ts`, what a
save rejects and why in `validatePageHierarchy`'s and `validatePostPlacement`'s
TSDoc, and the root-designation reasoning on `ROOT_PAGE_SLUG`.
`docs/NAVIGATION.md` covers the routing half.

**`slugLock: true` means "I do not hand-edit this slug"**, and that resolves
differently either side of first publish (#120):

- **Before first publish** the slug is derived from the title on every edit.
  Convenient, and safe — no public URL exists yet.
- **Once published** the slug is frozen at its published value. Editing the
  title can no longer move the URL.

Correction (this sentence used to read "Migrated slugs are locked — unlock in
admin to change"): under the old semantics the stored `slugLock: true` was
exactly what made a title edit rename a live URL, which is the bug #120
measured. The lock now means what it says. Every migrated and seeded document
already stores `slugLock: true`, so all of them are frozen by rule — no data
migration, no schema change.

**For editors — renaming a published URL deliberately:**

1. Open the doc, click **Unlock** beside the Slug field. The sentence under the
   input always states what will happen on save.
2. Type the new slug (a published doc never auto-fills it — a rename is typed,
   never inferred from a title).
3. Save/publish. A `redirects` row is created automatically, so the old URL
   keeps working; visitors and search engines get a permanent redirect to the
   new one.

**Enforcement is server-side.** `enforceSlugFreeze` (a `beforeValidate` field
hook) reverts a frozen slug regardless of caller — admin form, REST `PATCH`, or
MCP. A write that intends a rename must send `slugLock: false` in the same
payload; omitting it is not consent. The admin component mirrors the rule (it
stops re-deriving once `hasPublishedDoc`) purely so the editor is never shown a
value the server is about to revert.

**The unit of URL identity is the served PATH, not the slug (#150).** A row's
`from` is built by `publicPathFor` from the path the document was being served
at, which is why one hook covers four editorial actions that used to be
different problems:

| The editor…                  | `from`          | `to`            |
| ---------------------------- | --------------- | --------------- |
| renames an unplaced article  | `/articles/old` | `/articles/new` |
| renames a top-level page     | `/old`          | `/new`          |
| renames a **placed** article | `/work/old`     | `/work/new`     |
| **un-places** an article     | `/work/old`     | `/articles/old` |
| **re-parents** a page        | `/work/x`       | `/experience/x` |

The last two move the URL without moving the slug, so a slug-keyed writer saw
`from === to` and wrote nothing at all. The first two are unchanged from #120 —
`publicPathFor` answers `/articles/<slug>` for a post with no `path` and
`/<slug>` for a page whose `path` is its slug, which is every document that
existed before hierarchy. `createPathRedirect` (formerly `createSlugRedirect`)
is the writer; `capturePublishedSlug` keeps its name and stashes three values
from one lookup — the slug, the public path, and the raw `path` column the
subtree cascade matches on.

**Moving a page moves its subtree, in the same transaction.**
`cascadePagePaths` (Pages `afterChange`) reads the descendants of the old path
prefix — one indexed read per collection — recomputes each one's stored `path`
shallowest-first, and purges each vacated URL. Two flags govern it:
`disablePathCascade` stops a descendant write re-entering the cascade (without
it a depth-3 move is quadratic), and `disableSlugRedirect` stops each
descendant writing its own row. Neither suppresses `refreshCorvusEmbeddings`:
a placed post under a moved page genuinely changed its `sourceUrl`, so a
section rename costs an embedding refresh proportional to the subtree. That is
correct, not a bug. The cascade's writes are deliberately **not** wrapped —
unlike the redirect write, a half-moved subtree is a correctness problem and
should roll the move back.

Its precondition is **"the page's stored path moved"**, not "the page was
live". The old prefix is `capturePublishedSlug`'s stored-path stash, which is
read from the MAIN-TABLE row whatever its `_status` — descendants' paths were
composed from that row, and a draft save never writes it. Gating that one stash
on a published row (as the first cut did) made the cascade skip the first
publish of a never-published parent: a page drafted as `a`, given children
(stored `a/c`), renamed to `b` in draft, then published, moved its own row to
`b` and left `a/c` behind until the child's own next save. The slug and
served-path stashes stay gated on a published row, because those describe a URL
that was actually reachable — so a first publish still writes no redirect row.
**The served-prefix invariant closes what used to be the residual here (#180).**
That paragraph used to end with one: a **published** child under a
never-published parent moved from `/a/c` to `/b/c` with no redirect row
covering `/a/c`, because the D4 prefix row is keyed on the parent's own served
URL and the parent had none. The invariant removes the state rather than
documenting its consequence:

> **Every served page's ancestors are served too.** A page may not be published
> while its parent is unpublished, and a page may not be unpublished while a
> page or a placed post beneath it is still published.

A published child of an unpublished parent is the ONE way a served URL sits
under an unserved prefix, so refusing it means every subtree move now has a
served parent path to key its `matchDescendants` row on. The cascade itself is
unchanged — it still moves drafts and published rows alike, and a first publish
of a never-published parent still writes no redirect row for the parent, which
is correct because nothing was ever served there.

**Enforcement is at PUBLISH, not at placement, and that is forced.** Posts say
the same thing declaratively — `parent` carries
`filterOptions: () => ({ _status: { equals: 'published' }, … })`, which Payload
enforces as a field validation on every write. Pages cannot copy it: a section
is legitimately drafted whole and published top-down (#137), so a write-time
rule would refuse `work/brytecore` before `work` had shipped. The illegitimate
act is the publish, so that is where the block sits — two `beforeChange` guards
in `src/collections/Pages/hooks/servedPrefix.ts`, both firing on `_status`
alone, so the 100ms autosave gains no read.

**"At publish" covers the re-parent too, and the reason is worth knowing before
someone reads the guard and concludes otherwise** (raised as a hole in review,
disproved by measurement). Moving an already-published page onto a draft parent
lands a served URL under an unserved prefix without publishing anything, and the
publish guard tests `data._status`, so the write looks invisible to it. It is
not: Payload's `beforeValidate` **field** pass runs before every collection
`beforeChange` hook and merges the original document into the incoming data
(`payload/dist/fields/hooks/beforeValidate/index.js`), so a
`payload.update({ data: { parent } })` reaches the guard carrying the row's own
`_status: 'published'` and is refused on the **Parent** field like any other
publish. `evals/pages-hierarchy-integration.test.ts` pins it — the merge is a
Payload internal the guard depends on, and that case is what fails if it ever
changes. The invariant is therefore enforced over every write that goes through
the collection hooks; what it does not cover is stated below (rows written
before the guards, and writes that bypass `beforeChange` — direct SQL, a
migration, `db.updateOne`).

**Decision: the unpublish mirror REFUSES; it does not cascade-unpublish**
(Brandon, #180). Sweeping the subtree offline for the editor was considered and
rejected on three counts. It is a bulk write nobody asked for and nobody sees —
one gesture takes N documents off the site. It is not reversible by the same
gesture: re-publishing the parent does not re-publish what was swept, so the
editor cannot undo it without remembering what was live. And it breaks the
symmetry that makes the rule learnable — publishing already refuses rather than
publishing ancestors for you, so unpublishing refuses rather than unpublishing
descendants for you. The refusal names the shallowest blocker and its URL, and
leaves the decision with the editor.

**The rule is NARROW: the parent, not the ancestor chain.** The publish guard
checks the immediate parent's main-table `_status`; the unpublish guard checks
descendants of the page's own served path. Those compose inductively into the
full invariant — a published parent had to pass the same guard against ITS
parent — and the narrow form keeps a publish to one indexed read instead of a
depth-3 ancestor walk. The site root needs a second query shape, and the reason
is the root-page contract: the root contributes no path segment, so its
children are stored at `<child>` and not `home/<child>`, and a
`path LIKE 'home/%'` read would report no blockers while the root was taken out
from under the whole site. That branch reads by `parent` and leans on the
publish guard for depth, which is the one place the narrow form shows from
outside: a published GRANDCHILD under a draft direct child of the root is not in
that read, so unpublishing the root in that state would be allowed. The publish
guard refuses to create that state in either direction, so it can only pre-exist
the guards or be written around them. The non-root branch has no such gap — it
is a prefix read and sees every depth.
`readServedChildrenByParent`'s TSDoc is the single home
for it.

**Pre-existing violations are found, not assumed away.** The guards act on new
writes; rows that predate them are what
`scripts/audit-served-prefix.sql` is for — published pages whose parent page is
not published, and published placed posts whose parent page is not published,
read from the MAIN tables. The expected result is **0 rows from the two
violation queries, plus exactly one row from the third** — a tagged count,
`AUDIT_SERVED_PREFIX_VIOLATIONS=0`, which always returns a row and is how a
runner tells "clean" from "the query never ran". It is read-only and
safe against production. It takes the connection string from `DATABASE_URI`; the
file names the variable and never a value.

**Where the audit runs, and what to do when it fires** (#206).
`.github/workflows/audit-served-prefix.yml` runs that script against production
every Monday at 06:41 UTC, and on `workflow_dispatch`. It **fails the job** on a
non-zero total: a violation is a live URL under a prefix the site 404s, nothing
repairs it on its own, and a summary line nobody is paged for is how production
served four pages under a draft `/work` for days. The run summary carries the
outcome without opening logs, in three distinguishable forms, each with its own
exit code — `0 violations` (exit 0), `N violation(s)` with the offending rows
(exit 1), and **the audit did not complete** (exit 2), which is what a query
error or a dropped connection produces and is explicitly NOT a pass. The three
codes are the point: an error must fail _differently_ from a violation, not
merely also fail. The script's third statement prints
`AUDIT_SERVED_PREFIX_VIOLATIONS=<n>`, which is the line the job parses; its
absence is a failure, so an empty result can never be mistaken for a clean one.

When it fires, the fix is **editorial, not automatic** — the job repairs
nothing on purpose. Each row names the published document and the unpublished
parent above it: either publish the parent (the URL was meant to be served) or
unpublish the children (it was not). Both go through the admin UI, where the
#180 guards apply. The one thing not to do is re-run the job hoping it clears:
the state is at rest, and only a write changes it.

**Inbound coverage for a subtree is ONE row, not N** (D4). A moved page's row
carries `matchDescendants`, which makes it match `from` and everything beneath
it and carry the remainder across: `/work → /experience` also sends
`/work/brytecore` to `/experience/brytecore`. `resolveRedirect` tries exact
matches across the whole list first, so a specific override always beats the
prefix it sits under regardless of row order; the boundary is a slash, so
`/work` never swallows `/workshops`; and the self-redirect guard is applied to
the **rewritten** destination, which is the only form that can equal the
request. Migration `20260905_024451_m4_redirect_match_descendants` adds the
column to the existing table — no new table, so no RLS line.

**Redirects point at the document, not at a path** (`to.type: 'reference'`), so
renaming `a → b → c` leaves both `/articles/a` and `/articles/b` resolving
straight to `/articles/c` — no chain forms **for the URL a row is keyed at**.
That property does **not** extend to URLs captured beneath a prefix row: since
#178 such a request is rewritten onto the row's `toPathAtCapture` and
re-resolved through the same list, up to `MAX_REDIRECT_HOPS` times, because
resolving through the target's current path is exactly what skips the era the
descendant's own row is keyed under (`docs/NAVIGATION.md` §How many moves a URL
survives). `src/lib/cms/redirectsRepo.ts` is the cached reader;
`/articles/[slug]` and `/[...segments]` consult it on their not-found branch
only, so a live document always wins over a stale row.

**Passing state between hooks: write to `req.context`, never to the `context`
argument.** `createLocalReq` reassigns `req.context = getRequestContext(req,
context)` and `getRequestContext` returns a **new shallow-spread object**, so
every nested Local API call that forwards `req` — `payload.find({ req })` inside
a hook, for instance — swaps `req.context` and leaves the `context` argument
that hook was handed pointing at a detached copy. Writes to it vanish silently.
Write to `req.context` after your awaits, and read from `req.context` too. This
cost #120 a preview cycle: the hook worked for a one-shot rename (no nested
call) and did nothing on the admin path (nested `find`), which is very hard to
spot because the branching logic is identical.

**The old slug comes from the main table, never from `previousDoc`.** Posts and
Pages both run `autosave.interval: 100`, and Payload resolves the hook's
`originalDoc`/`previousDoc` from `getLatestCollectionVersion` — after any
autosave that is the DRAFT, which on a rename already holds the _new_ slug and
reports `_status: 'draft'`. A `beforeChange` hook
(`src/hooks/capturePublishedSlug.ts`) therefore reads the main-table row —
which a draft save never touches — and stashes it on `req.context` for
`createPathRedirect` and for the subtree cascade. The redirect writer's two
values are read from the row filtered to `_status: 'published'`; the cascade's
prefix falls back to the unfiltered row, per the paragraph above. Anything
added here that needs "the value the site is currently serving" must do the
same; `previousDoc` is not it.

Scope: only **Posts** and **Pages** are slug-routed (`slugPaths.ts`).
Categories, Tags, Projects, Authors and WorkHistory carry a slug with no public
URL behind it and keep the plain derive-from-title behaviour.

**WorkHistory's slug is an addressing key, not a route (#137).** It is `unique`
and derives from `company`. Nothing resolves a `work-history` row by URL — the
narrative for a role is a **Page** under `/work`, and the collection stays the
structured facts behind it. Two consumers need to name a role without holding
its id: Corvus composes `/work/<slug>` for the row's citation
(`sourceUrlFor`, `src/lib/ai/chunking.ts`), and the `workHistoryCard` block's
`entry` relationship and the role Page agree by convention on one spelling.

**Who purges which path (#132).** Two hooks call `revalidatePath` on a rename
and the split between them is a cross-file contract, so it is stated here
rather than only in each hook's TSDoc:

> **Whoever writes a redirect row purges that row's `from`. The revalidation
> hooks purge the document's own paths.**

Concretely: `revalidatePost`/`revalidatePage` purge the document's current path
on publish and `previousDoc`'s path on unpublish; a published→published rename
purges only the NEW path there, and `createPathRedirect` purges the old one —
inside the same `try` that wrote the row, from the same `from` string. The
subtree cascade follows the same rule for a move: it purges each descendant's
vacated path, and each descendant's own revalidation hook purges its new one.

The original reason was that there were **two path vocabularies** that
disagreed about the home page — the revalidation hooks mapped it to `/` while
`publicPathForSlug` called it `/home` — so a purge could be spelled differently
from the row it was meant to uncover. **#148 closed that**: `publicPathFor` is
now the single owner of every public path and `revalidatePage` resolves through
it, so both sides spell the root identically. The ownership split above stays,
for the reason that outlives the conflict: the purge is conditional on the write
having succeeded (it sits inside the same `try`, after the row lands) rather
than on a transition that fires either way. The transition matrices in
`revalidatePost.test.ts` and `revalidatePage.test.ts` pin every case, and they
are unchanged across #148 — which is the evidence that routing the hook through
the seam moved no behaviour.

**Unpublish purges the path the site was SERVING (#155).** `previousDoc` is the
latest _version_, so after any autosave it is the draft — already carrying the
new slug — and testing `previousDoc._status === 'published'` alone failed
closed: unpublishing a document with a pending autosaved rename purged
**nothing**. Two pieces close it, neither costing the autosave anything:

1. **`capturePublishedSlug` fires on unpublish.** Its guard mirrors Payload's
   own `isSavingDraft` predicate instead of testing the `_status: 'draft'` body
   that an unpublish and an autosave _share_.
2. **It stashes the served PATH as well as the slug**, because under #148/#153 a
   slug cannot name a placed document's URL. `readPreviousPublishedSlug`
   (redirect rows) and `readPreviousPublishedPath` (revalidation) read the two
   stashes; both come from one `findPublishedRow` lookup.

The revalidation hooks prefer the captured path over `previousDoc`, and its
presence is also what tells them a published row existed.

`capturePublishedSlug`'s docblock is the single home for the measured table of
what Payload passes on each transition, the `dist` citations for the predicate
and the admin's request shapes, and the correction to an earlier wrong reading
of `isSavingDraft`. Do not restate them here. The residual worth knowing at this
level: a **Local-API explicit draft save** reads as an unpublish, because
`createLocalReq` does not mirror the Local API's `draft` option into `req.query`.
For the capture itself that is one extra lookup and one redundant purge of a
still-live path — never a lost purge, never a lost write.

**Since #180 the same residual IS a lost write one hook over.** The served-prefix
unpublish guard (`refuseUnpublishWithServedDescendants`) reads the identical
predicate, so a `payload.update({ draft: true })` on a **published** page that
has published descendants is REFUSED, though it would have unpublished nothing.
That is a false refusal — a step up in severity from a wasted read — and the
sentence above no longer covers every consumer of the residual. It is
unreachable from the admin (autosave and "Save draft" are REST and carry
`draft=true`) and unreached in this repo. That guard's docblock is the single
home for the measurement, for the `req: { query: { draft: 'true' } }` escape
hatch, and for where the follow-up should start: `createLocalReq` sets
`req.payloadAPI` fifteen lines before the `req.query` line the residual rests
on, so the fix does not need the caller sweep the ticket implies — but
`payloadAPI` alone cannot separate a Local-API draft save from a Local-API
unpublish, which is the design choice the ticket has to carry.
`evals/slug-redirect-integration.test.ts` proves the capture behaviour end to end
and pins the autosave read count; the false refusal is pinned in both directions
by `src/collections/Pages/hooks/servedPrefix.test.ts`.

**A revalidation failure never fails the write (#135, #156).** Payload runs
`afterChange`/`afterDelete` collection hooks **inside the operation's
transaction**, so a hook that throws does not lose a cache purge — it rolls back
the document. `revalidatePath`/`revalidateTag` throw outside a Next request
scope, which is every Local-API or job-driven write. **Every purge in a
collection or global hook therefore goes through `containRevalidation`
(`src/hooks/containRevalidation.ts`)**, which logs at `error` with the failing
path and the reason and returns normally — `revalidatePost`, `revalidatePage`,
both `revalidateDelete` companions, `revalidateRedirects`,
`revalidateCollectionTag` and its delete companion, `revalidateGlobal`,
`createPathRedirect`'s post-write path purge, and `cascadePagePaths`'
per-descendant vacated-path purge. That list is exhaustive, and a grep for
`revalidatePath|revalidateTag` under `src/hooks`, `src/collections` and
`src/globals` is how to keep it so.

`cascadePagePaths` (`src/collections/Pages/hooks/pageHierarchy.ts`) is the one
worth reading before adding a purge anywhere, because its own docblock says the
cascade's writes are deliberately NOT wrapped and are allowed to roll the move
back. That asymmetry is about the writes: a descendant update that throws means
the cascade genuinely failed. A purge that throws means only that there is no
static-generation store in this scope and says nothing about whether the subtree
moved, so it is contained — once per descendant, so the log names the specific
URL left stale and one failure does not abandon the rest of the loop.

The `/api/revalidate` route handler is deliberately bare and is not in scope: it
is an HTTP endpoint, not a hook, so a throw there fails a request and rolls back
nothing. Do not "fix" it by wrapping it.

That module's docblock is the single home for the argument: the `dist` citations
for the transaction mechanics, the measurement, and the survey of `scripts/`
showing that no writer in this repo wants revalidation to be fatal. Do not
restate them here.

`context.disableRevalidate` is unchanged and is still the explicit opt-out — it
short-circuits the whole hook before any purge is attempted. It is not a
substitute for the wrap, because it only helps callers who set it.

**Permanent vs temporary redirects (#130).** The plugin is configured with
`redirectTypes: ['301', '302']`, which is what makes it emit a permanence
field at all — without that option it emits none and every redirect served as
a 308. The admin form offers **301 – Permanent** (the default) and
**302 – Temporary**; `src/lib/cms/redirectsRepo.ts` flattens the stored code
and the two not-found branches call `permanentRedirect` (308) or `redirect`
(307) accordingly. Only two of the plugin's five codes are offered because the
reader collapses them to permanent-or-not, and five options that produce two
behaviours is a way to make an editor pick wrong.

Anything not `'302'` reads as permanent — an unset, legacy or unrecognised
value included. That is deliberately the pre-#130 behaviour, so a row written
before the field existed is unchanged, and the conservative direction for a
rename. The rename rows `createPathRedirect` writes state `'301'` explicitly
rather than relying on the field default, because updating an existing row does
not re-apply a default and a row an editor had flipped to temporary would
otherwise stay temporary.

The migration is `20260902_205311_redirect_permanence`. It adds an enum type and
a `NOT NULL DEFAULT '301'` column to the **existing** `redirects` table, so the
new-table RLS rule below does not apply and no `ENABLE ROW LEVEL SECURITY`
statement belongs in it — `redirects` was swept by the #72 backfill and its RLS
is already on. `scripts/check-migrations-rls.mjs` agrees: the migration creates
no table, so it carries no obligation.

Known limits: the reader reads at most 500 rows — and since #178 it may walk
that one list up to six times per request (the initial pass plus five hops),
resolving each capture-time rewrite through it (`docs/NAVIGATION.md` §How many
moves a URL survives). The 500-row ceiling is also what makes the resolver's
fall-back-rather-than-serve-the-snapshot rule load-bearing: a row past the
ceiling is a missing intermediate hop, and serving the capture-time spelling
there would answer a permanent redirect to a dead URL.

## Plugins (`src/plugins/index.ts`)

- `plugin-seo` — meta title/description/image + previews; `generateTitle` is
  `{title} - Brandon Perfetti`; posts URL-prefix `/articles`.
- `plugin-redirects` — editorial redirects **plus** the rows
  `createPathRedirect` writes when a published Post/Page is deliberately moved;
  revalidated on change and served by `src/lib/cms/redirectsRepo.ts` (#120).
  Before that, nothing in `src/` read the collection, so a redirect row was
  inert. `redirectTypes: ['301', '302']` + a `defaultValue: '301'` override
  give each row a permanence the routes act on (#130), and a
  `matchDescendants` checkbox lets one row cover a moved section page's whole
  subtree (#150).
- `plugin-search` — synced search index over posts feeding `/api/search`.
- `plugin-mcp` — Payload MCP endpoint at `/api/mcp` (API-key auth) so agents
  can operate the CMS. Collections opt in with `{ enabled: true }` objects.

## Operating via MCP (for agents)

`plugin-mcp` exposes find/create/update/delete over Posts, Pages, Projects,
TechStack, Uses, Categories, Tags, WorkHistory, Media at `/api/mcp`
(API-key Bearer auth;
on deployed envs it also sits behind Vercel deployment protection, so pass
`x-vercel-protection-bypass` alongside the Bearer token). Tool schemas are
self-describing — an agent discovers _how_ to call them for free. What it
cannot infer are the invariants below; encode those, not the mechanics.

**Guardrails (violating these breaks production):**

- **Lexical node set.** Post `content` is Lexical JSON. Authoring or
  round-tripping it must preserve every node type the migration emits (lists
  ordered/unordered/check, blockquote, upload) plus blocks Banner/Code/
  MediaBlock — an unknown or dropped node crashes every migrated article with
  minified Lexical #17. Prefer editing bodies in `/admin`; use `updatePosts`
  on `content` only with a known-valid tree.
- **Locked slugs.** A published document's slug is frozen server-side (#120):
  `enforceSlugFreeze` reverts it, so an `updatePosts` that changes `title` — or
  that sends a new `slug` without `slugLock` — leaves the URL byte-identical.
  That is the safe default, not an error you will see. To rename deliberately,
  send `slugLock: false` alongside the new `slug` in the same write; the old
  path then redirects automatically and needs no hand-written redirect row.
  Prefer not renaming at all: the v3 slugs are the ones carrying external
  links. A bulk `where` update must never touch `slug` or `slugLock`.
- **Writes are live.** There is no dry-run; create/update/delete hit a real
  DB immediately. `find` (with a narrow `select`) to confirm state before any
  write.
- **Home `photoStrip`.** Since #42 the home doc's `photoStrip` is a plain
  layout block rendered inline through the shared page-builder seam — no
  hero-slot extraction, no exclusion. Reorder or edit it via `updatePages`
  like any other block (see the Home note under **Pages**).
- **Out of scope for MCP.** Globals (`SiteSettings`/`Navigation`/`Footer`/
  `Identity`) and `Users` are not exposed. Nav, footer, and identity edits are
  admin or code, never MCP.

**Recipes:**

- Bulk publish drafts: `updatePosts` with `where` `{"_status":{"equals":
"draft"}}` and `_status:"published"` (`revalidatePost` fires per doc → live
  immediately).
- Keep responses small: always `select` the fields you need and keep `depth`
  low (0–1); a naive `find` at high depth returns huge relationship trees.
- Drafts vs live: `draft:true` reads the versions table; `_status` sets
  published state on write.
- Safe backfills: `year` (Projects) and `proficiency` (TechStack) are null
  across the board today — targeted single-field updates.

**Key posture (review m8).** An MCP API key is an admin-equivalent
secret: `find` reads run as the key's principal (drafts and gated bodies
included) and write ops mutate live content. Scope keys with the plugin's
per-collection/per-operation permission checkboxes (adding a collection to
the plugin config adds permission COLUMNS — a schema change requiring
`migrate:create`, and new permissions default to unchecked). Store keys in
project-scoped keychain entries, rotate on any suspicion, and never grant
delete where find+update suffices.

**Connector-only agents.** An agent driving the MCP without a repo checkout
never reads this file — the only channel that travels with the tools is the
schema itself. Mirror the load-bearing guardrails into collection/field
`admin.description` so every agent sees them. Highest-value targets: Posts
`content` (Lexical node set) and the slug field (`src/fields/slug/`, lock
contract) in `src/collections/*`.

## Generated artifacts (committed + CI-gated)

- `src/payload-types.ts` ← `pnpm generate:types`
- `src/app/(payload)/admin/importMap.js` ← `pnpm generate:importmap`

Run both after any schema/field/plugin change; CI diffs them and fails on
staleness. A stale importMap manifests as missing admin UI (empty SEO tab,
unrenderable editor).

**`scripts/check-importmap.mjs` — the non-emptiness gate (#131).** Staleness is
not the only way an importMap goes wrong: `pnpm generate:importmap` can write an
**empty** map and exit 0 when component resolution fails, and staleness cannot
see that — an empty map regenerated as empty is not stale, so CI stays green
while every custom field component in the admin disappears at once. The gate
runs in the `quality` job between the regenerate and the diff, so it judges the
freshly generated content rather than what happens to be committed, and it
fails when either

- the map carries fewer than `MINIMUM_IMPORT_MAP_ENTRIES` entries — the floor is
  **25**, and the map carries **31** today — or
- a component this repo declares — any `'@/module#Export'` string in a non-test
  `src/` source, e.g. the slug field's — is missing from the map.

The expected components are derived from the config sources rather than frozen
in a list, so adding or removing one needs no second edit — but that scan is a
regex over single-quoted `@/`-rooted literals, not a parser, so a path spelled
any other way silently drops out of it. The entry floor is the backstop for
whatever the scan under-counts; neither check is complete alone. When the gate
fires, the fix is always to re-run the generator; if the map still comes back
short, that is the resolution failure #131 tracks and the result must not be
committed. Run it locally with `node scripts/check-importmap.mjs`.

**Diagnosis status: the empty-map failure is real but undiagnosed.** The
precondition that triggers it is not known. As of 2026-09-02 three independent
containers have each run `pnpm generate:importmap` on this tree and **failed to
reproduce** it: every one regenerated the map byte-identically to the committed
copy after `prettier --write` (97 lines, 7742 bytes, 31 entries, exit 0). The
issue's own inference — a workspace or `@payload-config` resolution difference
— is therefore neither confirmed nor refuted, and nobody should treat it as
settled. That non-reproduction is the argument for the shape of the gate rather
than against it: because we cannot yet detect the cause, the gate catches the
**outcome**, on freshly generated content, in the job that runs on every push.
If it ever fires in CI, the annotation names #131 and says not to commit the
result — that run is the next real datapoint anyone will get.

## Migrations

- `pnpm migrate:create` after schema changes → commit the migration.
- Vercel build runs `pnpm migrate && pnpm build` (`vercel.json`).
- `scripts/migrate-notion-to-payload.ts` was the one-time Notion→Payload
  content migration (upsert-by-slug, drafts, covers→Blob). Keep for
  reference; DRY_RUN/ONLY_SLUG knobs. Note: `payload run` kills floating
  promises at module-eval end — scripts must top-level `await`.
- `scripts/set-admin-password.ts` — Local API admin bootstrap/password reset.
- `scripts/backfill-corvus-embeddings.ts` (`pnpm corvus:backfill`) — populates
  and repairs the `corvus_embeddings` pgvector index the content hooks keep
  fresh. Not a Payload collection, deliberately; see `docs/AI.md`
  §"Retrieval grounding" for the table, the `access.visibility` filter that
  keeps gated bodies out of anonymous chat answers, and when to re-run it.

### New-table RLS convention (#72)

Every table in `public` has Row Level Security enabled with **no policies**
(default-deny) as of the `20260820_221032_rls_lockdown` migration, and
`ALTER DEFAULT PRIVILEGES` strips `anon`/`authenticated` table+sequence grants
from tables created afterward. Payload connects as the table **owner**, and
owners bypass RLS — so this is invisible to the app and to `payload migrate`.
It exists solely to keep Supabase's `anon`/`authenticated` Data API roles
locked out of `public`, independent of the Data API's exposed-schema config.

When you add a collection or global (a new table via `pnpm migrate:create`),
add a one-line follow-up in the **same** migration enabling RLS on the new
table and any paired `_v` / `_rels` table Payload generates:

```ts
await db.execute(sql`ALTER TABLE "new_table" ENABLE ROW LEVEL SECURITY;`)
```

CI enforces this (#117): `scripts/check-migrations-rls.mjs` runs in the
`quality` job and fails the build when a migration created **after** the
`20260820_221032_rls_lockdown` backfill has a `CREATE TABLE "x"` with no
`ALTER TABLE "x" ENABLE ROW LEVEL SECURITY` in the same file — companions
included, because Payload emits `_v` / `_rels` as their own `CREATE TABLE`
statements. Migrations at or before that backfill are grandfathered: it enabled
RLS through a dynamic `pg_tables` loop, so no table name appears as literal
text for a matcher to find. The script's header documents that audit.

Function grants are revoke-by-default too, as of the
`20260831_005000_issue_87_function_acls` migration (#87): `anon`/`authenticated`
get no `EXECUTE` on functions created in `public`, so a deliberate RPC needs an
explicit `GRANT EXECUTE` on that function in its own migration.

Table grants are revoke-by-default too, as of the
`20260905_190000_issue_159_table_acls` migration (#159). RLS alone was not
enough: default-deny RLS gates the read/write half but does **not** gate
`TRUNCATE` — measured on PostgreSQL 16, a role holding only `D` truncates an
RLS-enabled, policy-free table successfully — and Supabase had pre-seeded
`anon=Dxtm/postgres, authenticated=Dxtm/postgres` (TRUNCATE, REFERENCES,
TRIGGER, MAINTAIN) on every table in `public` plus the TABLES default ACL. That
migration revokes both halves for both roles.

**Acceptance for table ACLs reads `pg_class.relacl`**, never
`information_schema.role_table_grants`: that view is scoped to grants applicable
to the executing role, and it reported **0** rows for `anon`/`authenticated` on
the very production database whose `relacl` carried them. Check the default with
`pg_default_acl` (join `pg_namespace` on `defaclnamespace`, `defaclobjtype='r'`).
One entry is accepted residue and out of a repo migration's reach: the
`supabase_admin`-grantor default (`anon=arwdDxtm/supabase_admin`) — `REVOKE`
only removes privileges granted by the executing role, and migrations run as
`postgres`. That is the same class as the #141 function-ACL residue; treat it as
accepted, not as a gate failure.

`ALTER DEFAULT PRIVILEGES` already handles the grant side for new tables, but
it does **not** touch RLS state — that still needs the explicit `ENABLE` per
table. For a bulk sweep, reuse the `pg_tables` loop in
`20260820_221032_rls_lockdown.ts` rather than hand-listing tables. **Never** set
`FORCE ROW LEVEL SECURITY` — with no policies it would default-deny Payload's
own owner connection. RLS here is owner-transparent, not an app access layer
(Payload's gating is `src/access/*` + `getViewer()`).
