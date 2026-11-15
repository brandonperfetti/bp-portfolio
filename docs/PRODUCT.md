# Product

What the site is for, the judgments that keep recurring, and the decisions
already settled. Statements link to governing documents, issues or dated public
observations; unsettled choices stay under **Open** as hypotheses rather than
settled facts. Behavior detail lives in `docs/FEATURES.md`; which
journeys are proven, and how, is `docs/JOURNEYS.md`.

## Intent

**brandonperfetti.com is Brandon Perfetti's portfolio and content platform**
(`README.md` § Overview). Two kinds of people use it:

- **Readers and visitors** — read articles at `/articles/[slug]`, browse his
  work, stack and uses, and ask Corvus about Brandon, his work and the site.
  Articles are written to be audience-forward and practical: "focused on
  reader outcomes", ending with "a clear next action"
  (`docs/CONTENT_STYLE.md` § 1). Corvus is "a grounded assistant for
  everything Brandon: work history, technologies, projects, articles, and this
  site's own code — sourced from the pages here and his public repos"
  (`docs/AI.md` § What Corvus is, settled by Brandon 2026-09-04, #166).
- **Brandon as editor** — "new pages and section rearrangements are editorial
  acts, not deploys" (`README.md` § Overview): a CMS page is built from
  blocks, and a publish is live in seconds. Fixed routes (`/articles` and
  `/articles/[slug]`, `/sign-in`, `/account` and the like) are code, with CMS
  copy and blocks only where the route reads them.

The outcomes the existing docs commit to: v3 article links keep working
(`docs/NAVIGATION.md`), gated content is enforced on the server
(`docs/AUTH.md`), GA4 collects only once a visitor grants consent where
consent is required, and by default where it is not — with the cookieless
exceptions `docs/ANALYTICS.md` documents (Vercel Analytics always on; a
Consent Mode ping before consent), motion never costs a reader who asked for
less (`docs/DESIGN.md`), and Corvus's behavior is held by live CI evals
(`docs/AI.md` § Evals).

### Open (not settled — do not invent)

- No success metrics, conversion goals or target numbers are recorded for any
  surface. A change may not claim to move one.
- No audience segmentation beyond the two roles above is written down (who the
  articles are _for_ beyond "the reader" is per-article, `docs/CONTENT_STYLE.md`
  § 3).
- Product signals exist but are not wired to any of these outcomes — see
  § Signals.

### Working priority: reader usefulness (#320)

For the bounded November 2026 investigation, prioritize a reader finding a
relevant article, understanding its advice and choosing a useful next action.
This is the delegated product hypothesis, not a measured audience preference
or a conversion target. Technical journey proof is in `docs/JOURNEYS.md`.

**Keep** archive and global-palette discovery, readable article bodies, and
existing copy/share actions. **Change** the evidence behind the next product
choice: use a reader task before adding another continuation surface.
**Remove** the blanket assumption that articles offer no onward links; remove
no UI on the available evidence.

The public [runbooks-to-agent-skills article](https://brandonperfetti.com/articles/runbooks-to-agent-skills), inspected on 2026-11-12, already
had an inline link to another article, copy/share controls, an appended
archive and an actionable closing exercise. Source still confirms #219's
narrower gap: Posts has `relatedPosts`, but no component consumes it
(`src/collections/Posts/index.ts`, `ArticleView.tsx`). That field's existence
does not establish demand for another section, and one article does not
establish corpus-wide quality.

Comparison behind the choice:

- **Reader usefulness:** discovery, reading and retaining a link can be
  checked with the existing synthetic seed (`docs/JOURNEYS.md`). That makes
  this a bounded first verification task; usefulness still needs reader
  feedback. Pageviews cannot establish that advice helped.
- **Qualified inquiries:** no qualified-inquiry outcome signal was obtained.
  The contact route/delivery proof gap remains in `docs/JOURNEYS.md`; it is
  not evidence of failed inquiries. A live send was outside this pass.
- **Editorial efficiency:** #197's confirmed source gap concerns Local-API
  draft saves, not the normal admin path (`docs/PAYLOAD.md` § Local API
  gotchas). No observed publishing delay or repeated editor rework in this
  pass outweighs the reader hypothesis. These comparisons are not effort or
  revenue estimates.

**Next recommendation:** a focused reader task using an existing article:
find advice for a real problem, explain what to try, then retain the exact
link. Acceptance is that the reader can name a concrete next action and its
limitation without coaching; the synthetic test proves only finding,
rendering and copying. Brandon can collect a short de-identified
“what I tried / where I got stuck / what was missing” note during an existing
feedback conversation, then put the actionable gap in an issue. This is a
proposed signal, not collected feedback or authorization to send messages.
It needs no new tracking, schema or feature. If the advice itself is unclear,
improve that article's closing action through the content workflow; if readers
understand it but cannot choose a relevant follow-on, reconsider #219's
editor-curated links with its server/access tests. Neither change is part of
#320.

Revisit this priority when a relevant prospect hits a confirmed contact
blocker, publishing is demonstrably blocked or costly, or reader feedback
shows discovery and next actions already work well. A pageview increase alone
does not satisfy acceptance or justify changing the priority.

## Principles

Judgments that recur across features. Each links where it was argued.

- **Enforce on the server; the UI is a convenience.** Gating, the Corvus
  prompt and the slug freeze are all held in server code so the admin form,
  REST and MCP writes meet the same rule (`AGENTS.md` invariants;
  `src/fields/slug/enforceSlugFreeze.ts`).
- **Refuse rather than tidy on the editor's behalf.** A save that would leave
  the site inconsistent is refused with a message naming what to do first;
  an unpublish never takes offline documents the editor did not name
  (`docs/FEATURES.md` § Pages and sections, #180). A rename or re-parent is
  the deliberate exception: it moves the page's subtree and leaves one
  redirect (#150).
- **Content changes are editorial, not deploys.** If a fix can be a CMS edit,
  it is one — e.g. the home sticky rail is a checkbox, not a bug
  (`docs/TESTING.md` § Running e2e locally).
- **A result proves only the assertions that ran.** A green run with a skip is
  not evidence for the skipped path; read the skip reasons
  (`docs/TESTING.md` § Asserting CSS state, and § Verifying a journey locally
  for Playwright, which does not print them). CI arbitrates over local signals
  (`docs/WORKFLOW.md` § Pre-push).
- **Fix the behavior or the harness, never the floor** — eval thresholds and
  coverage gates are not lowered to get green (`docs/AI.md` § Evals).
- **Say what a reader filtered on, not where the chip came from.** Prefer the
  rule a reader can predict over carrying provenance through the code
  (`docs/FEATURES.md` § Articles, #154).

## Decisions

Only decisions whose rationale a future change is likely to collide with.
"Revisit when" is the condition the recorded reasoning depends on; where the
source states none, it says so.

### Payload is the only CMS; Notion is planning only

- **Context:** v3 read content from Notion at runtime.
- **Choice:** Payload is the CMS; Notion keeps ideas, outlines and the
  calendar, with no runtime integration, sync jobs or webhooks
  (`docs/CONTENT_WORKFLOW.md` § The split, "locked decision").
- **Consequence:** never rebuild a Notion sync; content questions are answered
  in Payload.
- **Revisit when:** the source records no condition; it is locked.

### A served page always has a served parent (#180)

- **Context:** nested URLs (`/work/brytecore`) come from a page's Parent.
- **Choice:** publishing checks the parent, unpublishing checks the children,
  re-parenting a live page checks the new parent — each refuses rather than
  cascading (`docs/FEATURES.md` § Pages and sections).
- **Consequence:** a section rename carries its subtree with one prefix
  redirect.
- **Revisit when:** the source records no condition. Known defect, not a
  bypass: a Local-API draft save of a published page with published children
  is wrongly refused, because the guard cannot see `draft: true` and reads it
  as an unpublish (#197; `docs/PAYLOAD.md` § Local API gotchas). The invariant
  itself stands.

### Corvus answers about everything Brandon, grounded in site content (#166)

- **Context:** page copy, prompt and citations described three different
  products.
- **Choice:** one positioning, appended to every grounded turn, outside the
  frozen system prompt; it neither narrows #77's broad scope nor widens what
  may be cited (`docs/AI.md` § What Corvus is).
- **Consequence:** every grounded eval block moves with the positioning.
- **Revisit when:** the positioning wording changes — it must change in page
  copy, `CORVUS_POSITIONING` and the evals together.

### No separate Playwright canvas gate for Storybook (#162)

- **Context:** stories threw in the canvas while the runner stayed green,
  because the two vite configs diverged.
- **Choice:** converge the configs; browser-mode Vitest already mounts every
  story in a real browser (`docs/TESTING.md` § Layers).
- **Consequence:** any bundler-level setting added to one config belongs in
  both.
- **Revisit when:** the canvas and runner configs can diverge again (the
  reasoning depends on them sharing `.storybook/main.ts`).

## Signals

What exists that could tell whether a journey works for real people. None is
connected to the outcomes above yet; no tracking is added by documenting this.

| Signal               | Route                        | What it can show                                                                                                          | Status                                                                                              |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| GitHub issues        | `gh issue list`              | defects found by the owner and reviewers, e.g. `/articles` Back/Forward query staleness (#267, #302; follow-up #307 open) | read; the only reader-facing feedback on record is owner/reviewer-found                             |
| Vercel Web Analytics | Vercel dashboard / connector | cookieless page views per route (`docs/ANALYTICS.md`), not usefulness                                                     | Aggregate inspection informs the #320 investigation; private traffic evidence is not published here |
| GA4                  | GA4 property                 | sessions after consent where it is required, and by default where it is not (`docs/ANALYTICS.md`)                         | exists; not read                                                                                    |
| Sentry               | Sentry project               | runtime errors on all three runtimes (`README.md` § Overview)                                                             | exists; not read                                                                                    |
| Search Console       | owner's account              | indexing and crawl status (#210)                                                                                          | exists; owner-held                                                                                  |

There is no in-product feedback route (no survey, no feedback widget).
Reading production analytics is an owner-authorized act, not part of routine
doc or test work.
