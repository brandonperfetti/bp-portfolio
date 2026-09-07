# Features

## Articles (`/articles`, `/articles/[slug]`)

- Payload Posts → `articlesRepo` → `ArticleLayout` + `ArticleBody`.
- Explorer: debounced search (`q`), topic filter (`topic`), URL-synced, `/`
  focuses search. Cards animate via shared motion tokens.
- Bodies are Lexical JSON converted by `lexicalToBlocks`; code blocks render
  through `CodeSnippet` (Prism), images through `next/image`.
- Gated posts (`access.visibility = 'gated'`) serve teaser-only to anonymous
  visitors — enforcement in the RSC via `canAccess`, not the client.
- Per-article "Use with AI" menu + JSON-LD + canonical URLs.
- Filter chips never navigate; when exactly one filter is active and it names a
  category with a published section home, the filter row offers a separate
  "View the ⟨X⟩ section →" link to it (#154). The lookup is by name, so a _tag_
  named exactly like a homed category offers the link too — deliberately: the
  reader filtered on that name and a section by that name exists, so offering it
  is right whichever pool the chip came from, and suppressing it would mean
  carrying each chip's provenance through the filter pool, the matcher and their
  tests (`ArticlesExplorer.tsx`, `sectionLink`).
- Section and topic landing pages roll up their own articles with the
  `postRollup` block — by category, or by placement — in a card grid, the
  stacked list, or a compact dated index (#152).

## Pages and sections (`/[...segments]`)

- A page gets a nested URL by pointing its **Parent** at another page —
  `/work/brytecore`, `/tech/ai` — up to three levels deep, with no code and no
  deploy. The Slug sidebar shows the full path the page will be served at.
- A whole section can be drafted top-down: create `work`, then everything under
  it, and publish when the section is ready. Nothing about placement is
  refused while the documents are drafts.
- **Publishing is what checks the parent.** A page cannot be published while its
  parent is still a draft — the URL would sit under a path the site does not
  serve. The save is refused on the **Parent** field, naming the page to publish
  first (#180).
- **Unpublishing checks the other direction, and refuses rather than tidying.**
  A page cannot be unpublished while a page or a placed article below it is
  still published; the message names the topmost one and its URL. Nothing is
  taken offline on the editor's behalf — one gesture never unpublishes
  documents the editor did not name, and never one they would have to remember
  in order to undo.
- Between them: **everything the site serves has a served parent.** That is what
  lets a section rename carry its whole subtree with a single redirect row.
- Renaming or re-parenting a published page moves its subtree in the same save
  and leaves one prefix redirect behind, so old links keep working (#150).

## Corvus chat (`/corvus`)

- Streaming chat over `/api/ai/chat` (Vercel AI SDK). Server-enforced persona
  prompt, Zod-validated payloads, Upstash rate limits + daily quota.
- Empty submit refocuses the composer (retained v3 nicety, e2e-covered).
- Evalite suites (`evals/`) cover persona, refusal, injection resistance.

## Command palette (⌘K / Ctrl+K)

- `src/components/search/CommandPalette.tsx` (cmdk): BM25-ranked article
  search over `/api/search` (plugin-search index, short-TTL cached),
  navigation, theme switch, copy-link, Ask Corvus.

## Tech-stack visualization (`/tech`, shared with `/uses`)

- `TechExplorer` + `TechCard`: category chips, proficiency chips, live GitHub
  activity badges (owner-wide scan, 6h cache), expandable scan evidence,
  A–Z / Most-active sort — all URL-synced (`q`, `category`, `sort`).
- Signals: `src/lib/integrations/github/techSignals.ts` (scan, ported from
  v3) + `src/lib/tech/githubSignals.ts` (cached index + name matching).
  Config: `GITHUB_OWNER`, `GITHUB_TOKEN`, `GITHUB_TECH_*` knobs. Unconfigured
  → badge-less render, never an error.

## Shader hero (home)

- shaders.com preset behind server-rendered hero text. Presets registry
  (`src/components/heros/presets.ts`): Northern Lights 2 (default dark),
  Drifting Lights 8, Static Noise 4 (light mode). Reduced-motion/no-WebGPU →
  static gradient; offscreen → canvas unmounts.

## Contact & newsletter

- `/api/contact` POST delivers contact-form email via Resend (migrated from
  SendGrid + renamed from `/api/sendgrid` 2026-08-10), with an explicit
  unchecked-by-default mailing-list opt-in checkbox. Clerk webhook
  (`/api/clerk/webhook`, svix verified) captures sign-up emails as Resend
  contacts.

## SEO surfaces

`sitemap.ts`, `robots.ts`, `feed.xml`, `llms.txt`, `llms-full.txt`, JSON-LD.
See `docs/SEO.md`.
