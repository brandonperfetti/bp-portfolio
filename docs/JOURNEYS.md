# Journeys and their proof

What a reader or editor does on the site, and which tests prove each step
works — including what is **not** proven. This is not the architecture:
where code lives is `docs/ARCHITECTURE.md`; why a surface behaves as it does is
`docs/FEATURES.md`.

How to read the proof column: **e2e** is a real browser on a production build
(`e2e/`, the Build · E2E job); **component** is Vitest + jsdom with Next
mocked; **pg** is the real-Payload/real-Postgres tier (`evals/*.test.ts`);
**eval** is Evalite. A component test proves the logic, not that the browser
does it. To watch a journey yourself on an instance you own, use
`docs/TESTING.md` § Verifying a journey locally.

**Content-dependent paths.** The CI seed (`scripts/seed-e2e.ts`) creates three
public posts with no topics, plus a small tech/uses set — so anything needing
more than 12 items, a topic, a gated post or an empty corpus **skips** in CI.
A skip proves nothing. Those paths are marked _unproven in a browser_ below.

## Reader

| Journey                                           | Route                                            | Proven by                                                                                                                                                                                                                                                                                         | Not proven                                                                                |
| ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Land on the home page                             | `/`                                              | e2e `smoke.spec.ts`, `a11y.spec.ts` (axe), `ui-regression.spec.ts` sticky rail                                                                                                                                                                                                                    | shader hero rendering (WebGPU; e2e runs reduced-motion)                                   |
| **Find an article by search, read it, come back** | `/articles` → `/articles/[slug]` → Back / reload | e2e `article-discovery.spec.ts`: the query narrows to the one matching seeded post, the click lands on it, Back and reload restore the query _and_ the narrowed list. Typing → URL also in `ui-regression.spec.ts`. Back/Forward write-gating: component `ArticlesExplorer.test.tsx` (#267, #302) | link-to-current-URL while a write is pending (#307, open, unmeasured)                     |
| Filter articles by topic                          | `/articles?topic=`                               | component `ArticlesExplorer.test.tsx` (chips call `router.replace`, section link #154)                                                                                                                                                                                                            | _unproven in a browser_ — seeded posts carry no topics                                    |
| Page through articles                             | `/articles?page=`                                | component tier; e2e `articles-pagination.spec.ts`, `pagination-anchor.spec.ts` exist                                                                                                                                                                                                              | _unproven in a browser_ — ≤12 seeded posts, every pagination e2e skips                    |
| Search from anywhere                              | ⌘K palette                                       | e2e `ui-regression.spec.ts` (opens/closes on Escape); story `CommandPalette.stories.tsx`                                                                                                                                                                                                          | a palette search reaching an article, in a browser; no unit test of ranking or navigation |
| Read a gated article anonymously                  | `/articles/[slug]`                               | component `canAccess.test.ts`, `GatedArticleBody.test.tsx`, article `page.test.tsx`                                                                                                                                                                                                               | _unproven in a browser_ — no gated post in the seed                                       |
| Old v3 links keep working                         | `/articles/<v3-slug>`, redirects                 | pg `slug-redirect-integration.test.ts`, `audit-served-prefix-integration.test.ts`; slug freeze `src/fields/slug/enforceSlugFreeze.ts`                                                                                                                                                             | a v3 URL fetched in a browser                                                             |
| Browse tech and uses                              | `/tech`, `/uses`                                 | e2e `tech-viz.spec.ts` (category/search/deep-link URL sync, uses cards)                                                                                                                                                                                                                           | pagination (skips); live GitHub badges (no token in CI)                                   |
| Ask Corvus                                        | `/corvus`                                        | e2e `ui-regression.spec.ts` (empty submit refocuses); component `CorvusChat*.test.tsx`; eval `pnpm eval:ci`, `pnpm eval:facts`                                                                                                                                                                    | a streamed answer in a browser (no provider key in e2e)                                   |
| Accept or refuse cookies                          | banner / dialog                                  | e2e `consent-*.spec.ts` (inset, focus return, scroll lock); component consent tests                                                                                                                                                                                                               | GA4 actually loading after consent                                                        |
| Contact Brandon                                   | contact form → `/api/contact`                    | component `captureContact.test.ts`, `resendContactMirror.test.ts` (list opt-in mirror)                                                                                                                                                                                                            | the route itself and delivery — no route test; Resend is never configured in CI           |

## Editor (Brandon, in `/admin`)

| Journey                                 | Proven by                                                                                                                                         | Not proven                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publish an article, see it live         | component `revalidatePost.test.ts`, `revalidate/route.test.ts` (`expire: 0`)                                                                      | list surfaces' real convergence time on Vercel (`docs/MAINTENANCE.md` § Watchpoints)                                                                     |
| Nest, publish, unpublish and move pages | pg `pages-hierarchy-integration.test.ts`; component `pageHierarchy.test.ts`, `servedPrefix.test.ts` (#180)                                        | Local-API draft saves (#197)                                                                                                                             |
| Build a page from blocks                | block rendering and interactions over supplied block data: Storybook stories + `pnpm test:storybook` (e.g. `src/blocks/RenderBlocks.stories.tsx`) | the admin side — picking, reordering and saving blocks in `/admin`, persistence, and the published-page round trip; nothing drives `/admin` in a browser |

## Keeping this map true

When a change adds a journey, changes what proves one, or turns a skip into a
real run, update the row in the same PR. Do not mark a row proven on the
strength of a skipped spec or a passing component test alone.
