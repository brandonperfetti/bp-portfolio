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
